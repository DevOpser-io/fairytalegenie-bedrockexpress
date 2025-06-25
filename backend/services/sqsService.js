const AWS = require('aws-sdk');

// Configure AWS SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION || 'us-east-1'
});

const QUEUE_URL = process.env.IMAGE_GENERATION_QUEUE_URL;

// Send message to image generation queue
async function sendToImageQueue(messageData) {
  try {
    if (!QUEUE_URL) {
      console.log('IMAGE_GENERATION_QUEUE_URL not configured - skipping image generation for MVP');
      return 'skipped';
    }
    
    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(messageData),
      MessageAttributes: {
        storyId: {
          DataType: 'String',
          StringValue: messageData.storyId
        },
        sectionId: {
          DataType: 'String',
          StringValue: messageData.sectionId
        }
      }
    };
    
    const result = await sqs.sendMessage(params).promise();
    console.log('Message sent to SQS:', result.MessageId);
    
    return result.MessageId;
  } catch (error) {
    console.error('SQS send error:', error);
    throw new Error('Failed to queue image generation');
  }
}

// Receive messages from queue (for Lambda function)
async function receiveMessages(maxMessages = 1) {
  try {
    const params = {
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: maxMessages,
      VisibilityTimeout: 300, // 5 minutes
      WaitTimeSeconds: 20 // Long polling
    };
    
    const result = await sqs.receiveMessage(params).promise();
    return result.Messages || [];
  } catch (error) {
    console.error('SQS receive error:', error);
    throw new Error('Failed to receive messages');
  }
}

// Delete message from queue
async function deleteMessage(receiptHandle) {
  try {
    const params = {
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle
    };
    
    await sqs.deleteMessage(params).promise();
    console.log('Message deleted from SQS');
  } catch (error) {
    console.error('SQS delete error:', error);
    throw new Error('Failed to delete message');
  }
}

module.exports = {
  sendToImageQueue,
  receiveMessages,
  deleteMessage
};