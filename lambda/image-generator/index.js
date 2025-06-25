/**
 * AWS Lambda function for generating story images
 * Triggered by SQS messages from the main application
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'fairytalegenie-stories';

exports.handler = async (event) => {
  console.log('Image generation Lambda triggered:', JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      const { storyId, sectionId, sceneText, characterDescriptor, imageSeed, imageKey } = messageBody;
      
      console.log(`Generating image for story ${storyId}, section ${sectionId}`);
      
      // Create image prompt
      const imagePrompt = createImagePrompt(sceneText, characterDescriptor);
      
      // Generate image using Amazon Nova Canvas
      const imageBuffer = await generateImageNova(imagePrompt, imageSeed);
      
      // Upload to S3
      await uploadImageToS3(imageKey, imageBuffer);
      
      console.log(`Successfully generated and uploaded image: ${imageKey}`);
      
    } catch (error) {
      console.error('Error processing image generation:', error);
      throw error; // This will send the message to DLQ if configured
    }
  }
  
  return { statusCode: 200, body: 'Images processed successfully' };
};

/**
 * Create a detailed image prompt for consistent story illustrations
 */
function createImagePrompt(sceneText, characterDescriptor) {
  return `Create a vibrant, child-friendly storybook illustration. 

Scene: ${sceneText}

Main Character(s): ${characterDescriptor}

Style Requirements:
- Bright, cheerful colors suitable for children
- Storybook illustration style (not photorealistic)
- Safe, wholesome content appropriate for ages 3-12
- Consistent character appearance matching the descriptor
- Clear, simple composition that tells the story
- High quality, detailed artwork
- No text or words in the image

The illustration should capture the magical, whimsical feeling of a children's fairytale while maintaining visual consistency with the character description provided.`;
}

/**
 * Generate image using AWS Bedrock Stable Diffusion XL
 * NOTE: This function is no longer used. We now use Nova Canvas (generateImageNova)
 */
async function generateImage(prompt, seed) {
  const body = {
    text_prompts: [
      {
        text: prompt,
        weight: 1.0
      }
    ],
    cfg_scale: 7,
    seed: parseInt(seed, 16) % 2147483647, // Convert hex seed to valid integer
    steps: 30,
    width: 768,
    height: 768,
    samples: 1
  };
  
  const command = new InvokeModelCommand({
    modelId: 'stability.stable-diffusion-xl-v1',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body)
  });
  
  console.log('Calling Bedrock Nova Canvas with prompt:', prompt.substring(0, 200) + '...');
  
  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
  
  if (responseBody.artifacts && responseBody.artifacts[0]) {
    const base64Image = responseBody.artifacts[0].base64;
    return Buffer.from(base64Image, 'base64');
  } else {
    throw new Error('No image generated in response');
  }
}

/**
 * Upload generated image to S3
 */
async function uploadImageToS3(key, imageBuffer) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/png',
    CacheControl: 'max-age=31536000' // 1 year cache
  });
  
  await s3Client.send(command);
  console.log(`Image uploaded to S3: s3://${BUCKET_NAME}/${key}`);
}

/**
 * Generate image using Amazon Nova Canvas
 */
async function generateImageNova(prompt, seed) {
  const body = {
    taskType: "TEXT_IMAGE",
    textToImageParams: {
      text: prompt,
      negativeText: "blurry, low quality, distorted, text, words, letters, scary, violent, inappropriate",
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      height: 768,
      width: 768,
      cfgScale: 7.0,
      seed: parseInt(seed, 16) % 2147483647
    }
  };
  
  const command = new InvokeModelCommand({
    modelId: 'amazon.nova-canvas-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body)
  });
  
  console.log('Calling Amazon Nova Canvas with prompt:', prompt.substring(0, 200) + '...');
  
  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
  
  if (responseBody.images && responseBody.images[0]) {
    return Buffer.from(responseBody.images[0], 'base64');
  } else {
    throw new Error('No image generated in Nova response');
  }
}