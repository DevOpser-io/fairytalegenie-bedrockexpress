/**
 * Amazon Bedrock Service
 * Handles interactions with Amazon Bedrock AI models using the AWS SDK v3
 */
const { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const config = require('../config');

/**
 * BedrockClient class that handles AWS authentication and model interactions
 */
class BedrockClient {
  constructor(regionName = config.aws.region, crossAccountRoleArn = config.aws.customerCrossAccountRoleArn) {
    this.regionName = regionName;
    this.crossAccountRoleArn = crossAccountRoleArn;
    this.credentialsExpiration = null;
    this.modelId = config.bedrock.modelId;
    this.defaultSystemMessage = config.chat.systemPrompt;
    this._initializeClient();
    
    console.log(`BedrockClient initialized with region: ${this.regionName}`);
    console.log(`Using cross-account role: ${this.crossAccountRoleArn || 'None (using default credentials)'}`);
    console.log(`Using model: ${this.modelId}`);
  }
  
  /**
   * Initialize the Bedrock client with appropriate credentials
   * @private
   */
  async _initializeClient() {
    try {
      // Create an STS client using default credentials for identity checks
      const stsClient = new STSClient({ region: this.regionName });
      
      // First check current identity
      try {
        const identityResult = await stsClient.send(new GetCallerIdentityCommand({}));
        console.log('Current AWS Identity:', JSON.stringify({
          Account: identityResult.Account,
          UserId: identityResult.UserId,
          Arn: identityResult.Arn
        }));
      } catch (error) {
        console.error('Failed to get caller identity:', error.message);
      }
      
      // Configure Bedrock client based on whether we're using cross-account role
      if (this.crossAccountRoleArn) {
        console.log(`Attempting to assume role: ${this.crossAccountRoleArn}`);
        const credentials = await this.assumeRole(this.crossAccountRoleArn);
        this.credentialsExpiration = credentials.expiration;
        
        // Create Bedrock client with temporary credentials
        this.bedrockClient = new BedrockRuntimeClient({
          region: this.regionName,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken
          }
        });
        
        console.log('Bedrock client created with temporary credentials');
      } else {
        // Create Bedrock client with default credentials
        this.bedrockClient = new BedrockRuntimeClient({ region: this.regionName });
        console.log('Bedrock client created with default credentials');
      }
    } catch (error) {
      console.error('Error initializing Bedrock client:', error);
      throw error;
    }
  }
  
  /**
   * Assume an IAM role and get temporary credentials
   * @param {string} roleArn - The ARN of the role to assume
   * @param {string} sessionName - The name for the session
   * @returns {Promise<Object>} - Temporary credentials object
   */
  async assumeRole(roleArn, sessionName = 'BedrockExpressSession') {
    try {
      const stsClient = new STSClient({ region: this.regionName });
      
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName,
        DurationSeconds: 3600 // 1 hour
      });
      
      const response = await stsClient.send(command);
      
      return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration
      };
    } catch (error) {
      console.error(`Failed to assume role ${roleArn}:`, error);
      throw error;
    }
  }
  
  /**
   * Refresh credentials if they are expired or about to expire
   * @param {boolean} forceRefresh - Force a refresh regardless of expiration
   */
  async refreshCredentialsIfNeeded(forceRefresh = false) {
    const shouldRefresh = forceRefresh || 
      !this.credentialsExpiration || 
      (this.credentialsExpiration && new Date(this.credentialsExpiration) < new Date(Date.now() + 5 * 60 * 1000));
    
    if (this.crossAccountRoleArn && shouldRefresh) {
      console.log('Refreshing temporary credentials');
      await this._initializeClient();
      console.log('Credentials refreshed successfully');
    }
  }
  
  /**
   * Prepare messages for Bedrock model
   * @param {Array} messages - Array of message objects
   * @returns {Array} - Formatted messages and system message
   * @private
   */
  _prepareMessages(messages) {
    console.log(`Input messages before formatting: ${JSON.stringify(messages, null, 2)}`);
    
    // Initialize formatted messages array and default system message
    const formattedMessages = [];
    let systemMessage = this.defaultSystemMessage;
    
    // Filter out empty messages
    const validMessages = messages.filter(msg => msg && msg.content);
    
    // Check if using Nova models
    const isNova = this.modelId.startsWith('amazon.nova');
    
    // Process each message
    for (const msg of validMessages) {
      const role = msg.role || 'user';
      
      if (role === 'system') {
        // Append any additional system messages to our default
        systemMessage = `${systemMessage}\n${msg.content}`;
      } else if (role === 'user' || role === 'assistant') {
        if (isNova) {
          // Nova format - content is an array with just text field
          formattedMessages.push({
            role: role,
            content: [{
              text: msg.content
            }]
          });
        } else {
          // Claude format - content includes type field
          formattedMessages.push({
            role: role,
            content: [{
              type: 'text',
              text: msg.content
            }]
          });
        }
      } else {
        // Default to 'user' for unrecognized roles
        if (isNova) {
          formattedMessages.push({
            role: 'user',
            content: [{
              text: msg.content
            }]
          });
        } else {
          formattedMessages.push({
            role: 'user',
            content: [{
              type: 'text',
              text: msg.content
            }]
          });
        }
      }
    }
    
    // If no messages, add a default user message
    if (formattedMessages.length === 0) {
      if (isNova) {
        formattedMessages.push({
          role: 'user',
          content: [{
            text: 'Hello'
          }]
        });
      } else {
        formattedMessages.push({
          role: 'user',
          content: [{
            type: 'text',
            text: 'Hello'
          }]
        });
      }
    }
    
    console.log(`Final formatted messages: ${JSON.stringify(formattedMessages, null, 2)}`);
    console.log(`Final system message: ${systemMessage}`);
    
    return [formattedMessages, systemMessage];
  }
  
  /**
   * Build request body based on model type
   * @private
   */
  _buildRequestBody(formattedMessages, systemMessage) {
    // Check if using Nova models
    if (this.modelId.startsWith('amazon.nova')) {
      // Nova format - system messages must be incorporated into the first user message
      const messages = [...formattedMessages];
      
      // If there's a system message, prepend it to the first user message
      if (systemMessage && messages.length > 0 && messages[0].role === 'user') {
        const originalContent = messages[0].content[0].text;
        messages[0].content[0].text = `${systemMessage}\n\n${originalContent}`;
      }
      
      const requestBody = {
        messages: messages,
        inferenceConfig: {
          maxTokens: config.bedrock.maxTokens,
          temperature: config.bedrock.temperature,
          topP: 0.9
        }
      };
      
      return requestBody;
    } else {
      // Claude/Anthropic format
      const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        messages: formattedMessages,
        max_tokens: config.bedrock.maxTokens,
        temperature: config.bedrock.temperature
      };
      
      // Add system message if present
      if (systemMessage) {
        requestBody.system = [{"type": "text", "text": systemMessage}];
      }
      
      return requestBody;
    }
  }

  /**
   * Create a chat completion
   * @param {Array} messages - Array of message objects
   * @param {boolean} stream - Whether to stream the response
   * @returns {Promise<Object|ReadableStream>} - Response object or stream
   */
  async createChatCompletion(messages, stream = false) {
    try {
      // Refresh credentials if needed
      await this.refreshCredentialsIfNeeded();
      
      // Validate input
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages must be a non-empty array');
      }
      
      console.log(`Creating ${stream ? 'streaming' : 'non-streaming'} chat completion`);
      console.log(`Using model: ${this.modelId}`);
      console.log(`Message count: ${messages.length}`);
      
      // Prepare messages in the format expected by the model
      const [formattedMessages, systemMessage] = this._prepareMessages(messages);
      
      // Build the request body based on model type
      const requestBody = this._buildRequestBody(formattedMessages, systemMessage);
      
      console.log(`Final request body being sent to Bedrock: ${JSON.stringify(requestBody, null, 2)}`);
      
      if (!stream) {
        // For non-streaming responses
        const command = new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestBody)
        });
        
        const response = await this.bedrockClient.send(command);
        const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
        return responseBody;
      } else {
        // For streaming responses
        const streamCommand = new InvokeModelWithResponseStreamCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestBody)
        });
        
        const streamResponse = await this.bedrockClient.send(streamCommand);
        return streamResponse;
      }
    } catch (error) {
      console.error('Error in createChatCompletion:', error);
      
      // Log detailed AWS SDK error information
      if (error.$metadata) {
        console.error('AWS Bedrock Error Details:', {
          httpStatusCode: error.$metadata.httpStatusCode,
          requestId: error.$metadata.requestId,
          errorCode: error.name,
          errorType: error.$fault,
          modelId: this.modelId,
          fullError: JSON.stringify(error, null, 2)
        });
      }
      
      throw error;
    }
  }
}

// Create a singleton instance
const bedrockClientInstance = new BedrockClient();

/**
 * Parse response based on model type
 * @private
 */
function parseModelResponse(response, modelId) {
  if (modelId.startsWith('amazon.nova')) {
    // Nova format
    if (response && response.output && response.output.message && response.output.message.content) {
      const content = response.output.message.content;
      if (Array.isArray(content) && content.length > 0 && content[0].text) {
        return content[0].text;
      }
    }
  } else {
    // Claude/Anthropic format
    if (response && response.content && Array.isArray(response.content) && response.content.length > 0) {
      return response.content[0].text;
    }
  }
  
  console.error('Unexpected response format:', response);
  throw new Error('Unexpected response format from Bedrock');
}

/**
 * Generate a response from the Amazon Bedrock model
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Additional options (temperature, maxTokens, etc.)
 * @returns {Promise<string>} - The generated response text
 */
async function generateResponse(messages, options = {}) {
  try {
    const response = await bedrockClientInstance.createChatCompletion(messages, false);
    return parseModelResponse(response, bedrockClientInstance.modelId);
  } catch (error) {
    console.error('Error generating response from Bedrock:', error);
    
    // Log additional error context
    if (error.$metadata) {
      console.error('Bedrock API Error Context:', {
        httpStatusCode: error.$metadata.httpStatusCode,
        requestId: error.$metadata.requestId,
        attempts: error.$metadata.attempts,
        totalRetryDelay: error.$metadata.totalRetryDelay
      });
    }
    
    throw error;
  }
}

/**
 * Generate streaming response from Amazon Bedrock model
 * @param {Array} messages - Array of message objects with role and content
 * @param {Function} onChunk - Callback for each chunk of the response
 * @param {Object} options - Additional options (temperature, maxTokens, etc.)
 */
async function generateStreamingResponse(messages, onChunk, options = {}) {
  try {
    const streamResponse = await bedrockClientInstance.createChatCompletion(messages, true);
    
    // Handle streaming response
    const stream = streamResponse.body;
    
    // Process the stream events
    for await (const event of stream) {
      if (event.chunk && event.chunk.bytes) {
        const chunk = Buffer.from(event.chunk.bytes).toString('utf-8');
        const parsed = JSON.parse(chunk);
        
        if (bedrockClientInstance.modelId.startsWith('amazon.nova')) {
          // Nova streaming format
          if (parsed.contentBlockDelta && parsed.contentBlockDelta.delta && parsed.contentBlockDelta.delta.text) {
            onChunk(parsed.contentBlockDelta.delta.text);
          }
        } else {
          // Claude/Anthropic streaming format
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            onChunk(parsed.delta.text);
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error generating streaming response from Bedrock:', error);
    throw error;
  }
}

/**
 * Generate a story using the configured AI model
 * @param {string} prompt - The story generation prompt
 * @returns {Promise<string>} - The generated story JSON
 */
async function generateStory(prompt) {
  try {
    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const response = await generateResponse(messages);
    
    // Validate JSON response
    try {
      JSON.parse(response);
      return response;
    } catch (parseError) {
      console.error('Invalid JSON response from AI model:', response);
      throw new Error('Failed to generate valid story format');
    }
  } catch (error) {
    console.error('Error generating story:', error);
    throw error;
  }
}

/**
 * Generate an image using Stable Diffusion via Bedrock
 * @param {string} prompt - The image generation prompt
 * @param {string} seed - Seed for consistent generation
 * @returns {Promise<Buffer>} - The generated image as a buffer
 */
async function generateImage(prompt, seed) {
  try {
    // For MVP, return a placeholder - actual implementation would use Bedrock's Stable Diffusion
    // This would be implemented when the Lambda function is set up
    console.log('Image generation requested:', { prompt, seed });
    
    // TODO: Implement actual Bedrock Stable Diffusion call
    // const imageClient = new BedrockRuntimeClient({ region: config.aws.region });
    // const command = new InvokeModelCommand({
    //   modelId: 'stability.stable-diffusion-xl-v1',
    //   contentType: 'application/json',
    //   accept: 'image/png',
    //   body: JSON.stringify({
    //     text_prompts: [{ text: prompt }],
    //     cfg_scale: 7,
    //     seed: parseInt(seed, 16),
    //     steps: 30
    //   })
    // });
    // const response = await imageClient.send(command);
    // return response.body;
    
    throw new Error('Image generation not yet implemented');
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

module.exports = {
  BedrockClient,
  bedrockClientInstance,
  generateResponse,
  generateStreamingResponse,
  generateStory,
  generateImage
};
