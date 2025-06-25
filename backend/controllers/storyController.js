const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { generateResponse } = require('../services/bedrockService');
const { get, set, incr, expire } = require('../services/redisService');
const { uploadToS3 } = require('../services/s3Service');
const { sendToImageQueue } = require('../services/sqsService');
const db = require('../models');
const config = require('../config');

// Ensure database is initialized before accessing models
async function ensureDatabaseInitialized() {
  if (process.env.NODE_ENV === 'production' && typeof db.initializeDatabase === 'function') {
    console.log('Ensuring database is initialized before accessing models');
    await db.initializeDatabase();
  }
  return db.Story;
}

// Story generation controller
class StoryController {
  // POST /v1/story - Generate a new story
  async generate(req, res) {
    try {
      const { keywords, age, childName, childGender, childCharacteristics, storyStyle, familyNames, notes } = req.body;
      
      // Validate input
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'Keywords are required and must be an array' });
      }
      
      if (keywords.length > 5) {
        return res.status(400).json({ error: 'Maximum 5 keywords allowed' });
      }
      
      if (!age || age < 1 || age > 12) {
        return res.status(400).json({ error: 'Age must be between 1 and 12' });
      }
      
      if (notes && notes.length > 600) {
        return res.status(400).json({ error: 'Additional notes must be 600 characters or less' });
      }
      
      if (childCharacteristics && childCharacteristics.length > 200) {
        return res.status(400).json({ error: 'Child characteristics must be 200 characters or less' });
      }
      
      if (!storyStyle || !['prose', 'rhyme'].includes(storyStyle)) {
        return res.status(400).json({ error: 'Story style must be either "prose" or "rhyme"' });
      }
      
      // Content moderation is handled by Bedrock guardrails during story generation
      
      // Rate limiting check - TEMPORARILY DISABLED FOR DEVELOPMENT
      // Note: For production scaling to thousands of requests/second, consider:
      // - User-based rate limiting instead of IP-based
      // - Sliding window rate limiting
      // - Distributed rate limiting with Redis Cluster
      // - AWS API Gateway rate limiting
      /* 
      const clientIp = req.ip || req.connection.remoteAddress;
      const rateLimitKey = `story_limit:${clientIp}:${new Date().toISOString().split('T')[0]}`;
      const currentCount = await get(rateLimitKey) || 0;
      
      if (currentCount >= (process.env.STORY_RATE_LIMIT || 5)) {
        return res.status(429).json({ error: 'Daily story limit reached. Please try again tomorrow.' });
      }
      */
      
      // Generate story ID
      const storyId = uuidv4();
      
      // Store initial story status
      const cache_version = config.cache.version;
      await set(`story:${cache_version}:${storyId}`, JSON.stringify({
        status: 'generating',
        createdAt: new Date().toISOString()
      }), 3600); // 1 hour TTL
      
      // Increment rate limit counter - TEMPORARILY DISABLED FOR DEVELOPMENT
      // await incr(rateLimitKey);
      // await expire(rateLimitKey, 86400); // 24 hours
      
      // Generate story asynchronously
      // Get user ID if authenticated
      const userId = req.user ? req.user.id : null;
      
      this.generateStoryAsync(storyId, { 
        keywords, age, childName, childGender, childCharacteristics, storyStyle, familyNames, notes, userId 
      });
      
      // Return 202 Accepted with story ID
      res.status(202).json({ storyId });
      
    } catch (error) {
      console.error('Story generation error:', error);
      res.status(500).json({ error: 'Failed to generate story' });
    }
  }
  
  // GET /v1/story/:storyId - Get story by ID
  async getStory(req, res) {
    try {
      const { storyId } = req.params;
      
      // Check Redis for story data
      const cache_version = config.cache.version;
      const storyData = await get(`story:${cache_version}:${storyId}`);
      
      if (!storyData) {
        return res.status(404).json({ error: 'Story not found' });
      }
      
      const story = JSON.parse(storyData);
      
      // Return appropriate response based on status
      if (story.status === 'generating') {
        res.status(200).json({ 
          status: 'generating',
          message: 'Story is being generated. Please check back in a moment.' 
        });
      } else if (story.status === 'completed') {
        res.status(200).json({
          status: 'completed',
          title: story.title,
          sections: story.sections,
          characterDescriptor: story.characterDescriptor
        });
      } else if (story.status === 'failed') {
        res.status(200).json({
          status: 'failed',
          error: story.error || 'Story generation failed'
        });
      }
      
    } catch (error) {
      console.error('Get story error:', error);
      res.status(500).json({ error: 'Failed to retrieve story' });
    }
  }
  
  // Async story generation
  async generateStoryAsync(storyId, params) {
    try {
      // Create prompt for Claude
      const prompt = this.createStoryPrompt(params);
      
      // Call Claude via Bedrock (content moderation handled by Bedrock guardrails)
      // Use the same pattern as chat controller
      const messages = [
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const storyContent = await generateResponse(messages);
      
      // Parse story content
      const story = JSON.parse(storyContent);
      
      // Generate seed for consistent images
      const imageSeed = crypto.createHash('sha256').update(storyId).digest('hex').substring(0, 8);
      
      // Add image generation details to each section
      story.sections = story.sections.map((section, index) => ({
        ...section,
        id: `${storyId}-section-${index}`,
        imageKey: `stories/${storyId}/section-${index}.png`,
        promptSeed: imageSeed
      }));
      
      // Store completed story in Redis
      const completedStory = {
        status: 'completed',
        ...story,
        createdAt: new Date().toISOString()
      };
      
      const cache_version = config.cache.version;
      await set(`story:${cache_version}:${storyId}`, JSON.stringify(completedStory), 86400); // 24 hour TTL
      
      // Save to database for permanent storage (if user is authenticated)
      try {
        // Ensure database is initialized before accessing Story model
        const Story = await ensureDatabaseInitialized();
        
        // Create preview text from first section
        const previewText = story.sections && story.sections[0] 
          ? story.sections[0].text.substring(0, 150) + (story.sections[0].text.length > 150 ? '...' : '')
          : '';

        await Story.create({
          story_id: storyId,
          user_id: params.userId || null, // Only set if user is authenticated
          title: story.title || 'Untitled Story',
          story_data: completedStory,
          status: 'completed',
          child_name: params.childName,
          child_age: params.age,
          story_style: params.storyStyle || 'prose',
          preview_text: previewText
        });
        
        console.log(`Story ${storyId} saved to database`);
      } catch (dbError) {
        console.error('Error saving story to database:', dbError);
        // Don't fail the whole story generation if database save fails
      }
      
      // Send sections to image generation queue (optional for MVP)
      for (const section of story.sections) {
        try {
          const result = await sendToImageQueue({
            storyId,
            sectionId: section.id,
            sceneText: section.text,
            characterDescriptor: story.characterDescriptor,
            imageSeed,
            imageKey: section.imageKey
          });
          
          if (result === 'skipped') {
            console.log(`Image generation skipped for section ${section.id} - MVP mode`);
          }
        } catch (imageError) {
          console.error(`Failed to queue image for section ${section.id}:`, imageError.message);
          // Don't fail the whole story generation if image queuing fails
        }
      }
      
    } catch (error) {
      console.error('Async story generation error:', error);
      
      // Log detailed error information for Bedrock errors
      if (error.$metadata) {
        console.error('Bedrock error details:', {
          httpStatusCode: error.$metadata.httpStatusCode,
          requestId: error.$metadata.requestId,
          errorCode: error.name,
          errorMessage: error.message,
          fault: error.$fault
        });
      }
      
      // Check if this is a throttling error
      let errorMessage = error.message;
      if (error.name === 'ThrottlingException' || 
          error.name === 'TooManyRequestsException' ||
          (error.$metadata && error.$metadata.httpStatusCode === 429)) {
        errorMessage = 'Service is temporarily busy. Please try again in a few moments.';
        console.error('Bedrock throttling detected - consider implementing retry logic');
      } else if (error.message && (
        error.message.includes('guardrail') || 
        error.message.includes('content policy') ||
        error.message.includes('safety filter') ||
        error.code === 'ValidationException'
      )) {
        errorMessage = 'Content was blocked by safety guidelines. Please try different story elements.';
      }
      
      // Update story status to failed
      const cache_version = config.cache.version;
      await set(`story:${cache_version}:${storyId}`, JSON.stringify({
        status: 'failed',
        error: errorMessage,
        createdAt: new Date().toISOString()
      }), 3600); // 1 hour TTL
    }
  }
  
  // Create prompt for Claude
  createStoryPrompt(params) {
    const { keywords, age, childName, childGender, childCharacteristics, storyStyle, familyNames, notes } = params;
    
    // Create pronoun mappings
    const pronouns = {
      'boy': { they: 'he', them: 'him', their: 'his', themself: 'himself' },
      'girl': { they: 'she', them: 'her', their: 'her', themself: 'herself' },
      'non-binary': { they: 'they', them: 'them', their: 'their', themself: 'themself' },
      'prefer-not-to-say': { they: 'they', them: 'them', their: 'their', themself: 'themself' }
    };
    
    const childPronouns = pronouns[childGender] || pronouns['prefer-not-to-say'];
    
    return `You are a creative children's story writer. Generate a fairytale story with the following requirements:

Main character details:
- Name: ${childName}
${childGender ? `- Gender: ${childGender}` : ''}
- Pronouns: ${childPronouns.they}/${childPronouns.them}/${childPronouns.their}
- Age: ${age} years old
${childCharacteristics ? `- Physical characteristics and preferences: ${childCharacteristics}` : '- IMPORTANT: NO physical descriptions allowed - focus only on personality and actions'}

Story elements to incorporate: ${keywords.join(', ')}
${familyNames && familyNames.length > 0 ? `Family members to include: ${familyNames.join(', ')}` : ''}
${notes ? `Additional notes: ${notes}` : ''}

Writing Style: ${storyStyle === 'rhyme' ? `IMPORTANT: Write the ENTIRE story in simple rhyming couplets like Dr. Seuss for age ${age}. Use VERY simple words a ${age}-year-old can understand. Each line should rhyme with the next line (AABB pattern). Keep sentences short and bouncy.` : 'Write the story in traditional prose format'}

Requirements:
1. Create an age-appropriate story with 4-6 sections
2. ${storyStyle === 'rhyme' ? `Each section should be 4-6 simple rhyming couplets (lines that rhyme in pairs). Use only words a ${age}-year-old knows.` : 'Each section should be 50-100 words'}
3. The main character should be named ${childName} and use the pronouns ${childPronouns.they}/${childPronouns.them}/${childPronouns.their}
4. ${childCharacteristics ? 'Include the provided character characteristics in the story and character description' : 'NEVER mention physical features like hair, eyes, skin, freckles, etc. Focus only on personality and actions.'}
5. The story should have a clear beginning, middle, and end
6. Include a positive moral or lesson appropriate for age ${age}
7. If family names are provided, incorporate them naturally into the story
8. ${storyStyle === 'rhyme' ? `CRITICAL: Every section must be simple rhyming couplets (AABB). Use ONLY basic words like: cat, hat, fun, run, play, day, big, dig, etc. Make it bouncy and silly like Dr. Seuss for a ${age}-year-old.` : 'Use engaging, descriptive prose with vivid imagery appropriate for children'}

${storyStyle === 'rhyme' ? `
EXAMPLE of simple Dr. Seuss style rhyming couplets for age ${age}:
{
  "title": "Noa and the Big Red Cat",
  "sections": [
    {
      "text": "Noa saw a cat so fat,\\nSitting on a big blue mat.\\nThe cat was red, the cat was round,\\nThe biggest cat that could be found!"
    }
  ]
}

Remember: Each section must be in rhyming verse like the example above.

` : ''}Return the story in this exact JSON format:
{
  "title": "Story Title",
  "characterDescriptor": "Detailed visual description of ${childName} for consistent image generation",
  "sections": [
    {
      "text": "${storyStyle === 'rhyme' ? 'Rhyming verse text here...' : 'Section text here...'}"
    }
  ]
}

${childCharacteristics ? 
`The characterDescriptor should include ONLY the provided characteristics: ${childCharacteristics}. Add appropriate clothing and any magical attributes for the story.` : 
`The characterDescriptor must be completely GENERIC with NO physical descriptions. Example: "A ${age}-year-old child wearing casual clothes, ready for adventure." Do NOT mention hair, eyes, skin tone, height, or any physical features whatsoever.`}`;
  }
}

module.exports = new StoryController();