const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { generateResponse } = require('../services/bedrockService');
const { get, set, incr, expire } = require('../services/redisService');
const { uploadToS3 } = require('../services/s3Service');
const { sendToImageQueue } = require('../services/sqsService');

// Story generation controller
class StoryController {
  // POST /v1/story - Generate a new story
  async generate(req, res) {
    try {
      const { keywords, age, characterNames, notes } = req.body;
      
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
      
      // Content moderation is handled by Bedrock guardrails during story generation
      
      // Rate limiting check
      const clientIp = req.ip || req.connection.remoteAddress;
      const rateLimitKey = `story_limit:${clientIp}:${new Date().toISOString().split('T')[0]}`;
      const currentCount = await get(rateLimitKey) || 0;
      
      if (currentCount >= (process.env.STORY_RATE_LIMIT || 5)) {
        return res.status(429).json({ error: 'Daily story limit reached. Please try again tomorrow.' });
      }
      
      // Generate story ID
      const storyId = uuidv4();
      
      // Store initial story status
      await set(`story:${storyId}`, JSON.stringify({
        status: 'generating',
        createdAt: new Date().toISOString()
      }), 3600); // 1 hour TTL
      
      // Increment rate limit counter
      await incr(rateLimitKey);
      await expire(rateLimitKey, 86400); // 24 hours
      
      // Generate story asynchronously
      this.generateStoryAsync(storyId, { keywords, age, characterNames, notes });
      
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
      const storyData = await get(`story:${storyId}`);
      
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
      
      // Store completed story
      await set(`story:${storyId}`, JSON.stringify({
        status: 'completed',
        ...story,
        createdAt: new Date().toISOString()
      }), 86400); // 24 hour TTL
      
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
      
      // Check if this is a Bedrock guardrail violation
      let errorMessage = error.message;
      if (error.message && (
        error.message.includes('guardrail') || 
        error.message.includes('content policy') ||
        error.message.includes('safety filter') ||
        error.code === 'ValidationException'
      )) {
        errorMessage = 'Content was blocked by safety guidelines. Please try different story elements.';
      }
      
      // Update story status to failed
      await set(`story:${storyId}`, JSON.stringify({
        status: 'failed',
        error: errorMessage,
        createdAt: new Date().toISOString()
      }), 3600); // 1 hour TTL
    }
  }
  
  // Create prompt for Claude
  createStoryPrompt(params) {
    const { keywords, age, characterNames, notes } = params;
    
    return `You are a creative children's story writer. Generate a fairytale story with the following requirements:

Keywords to incorporate: ${keywords.join(', ')}
Target age: ${age} years old
${characterNames ? `Character names to use: ${characterNames.join(', ')}` : ''}
${notes ? `Additional notes: ${notes}` : ''}

Requirements:
1. Create an age-appropriate story with 4-6 sections
2. Each section should be 50-100 words
3. Include a consistent main character with distinctive visual features
4. The story should have a clear beginning, middle, and end
5. Include a positive moral or lesson

Return the story in this exact JSON format:
{
  "title": "Story Title",
  "characterDescriptor": "Detailed visual description of main character(s) for consistent image generation",
  "sections": [
    {
      "text": "Section text here..."
    }
  ]
}

The characterDescriptor should include specific details like:
- Physical appearance (colors, size, distinctive features)
- Clothing or accessories
- Any magical or special attributes
This descriptor will be used to ensure visual consistency across all illustrations.`;
  }
}

module.exports = new StoryController();