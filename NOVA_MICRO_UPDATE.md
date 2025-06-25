# Amazon Nova Integration Update

## Overview
The Fairytale Genie application has been updated to use **Amazon Nova Lite** (`amazon.nova-lite-v1:0`) instead of Claude Sonnet for text generation and story creation.

## What Changed

### 1. Configuration Update (`backend/config/index.js`)
- Changed default model from `us.anthropic.claude-3-5-sonnet-20241022-v2:0` to `amazon.nova-lite-v1:0`
- Can still be overridden with `BEDROCK_MODEL_ID` environment variable

### 2. Bedrock Service Update (`backend/services/bedrockService.js`)
- Added model-specific request formatting:
  - Nova models use the `inferenceConfig` format
  - Claude models use the `anthropic_version` format
- Added model-specific response parsing:
  - Nova responses: `response.output.message.content[0].text`
  - Claude responses: `response.content[0].text`
- Updated streaming response handling for both model types
- Made the service flexible to support both Nova and Claude models

## Nova Lite Request Format
```json
{
  "messages": [
    {
      "role": "user",
      "content": [{
        "text": "message content"
      }]
    }
  ],
  "inferenceConfig": {
    "maxTokens": 2048,
    "temperature": 0.7,
    "topP": 0.9
  }
}
```

**Important Nova Format Differences**:
- Nova models do not support "system" role messages. System prompts are automatically prepended to the first user message.
- Content array objects should only have a "text" field (no "type" field like Claude models)

## Benefits of Nova Lite
- Native AWS model with improved performance over Nova Micro
- Better quality text generation for creative content
- Cost-effective for production use
- No third-party dependencies
- Seamless integration with AWS services

## Testing the Update
1. The application will automatically use Nova Lite for all text generation
2. Check logs for "Using model: amazon.nova-lite-v1:0" to confirm
3. Story generation should work as before with improved quality

## Rollback Instructions
To switch back to Claude or use a different model:
1. Set the `BEDROCK_MODEL_ID` environment variable to your desired model
2. The service will automatically detect the model type and use appropriate formatting

Example:
```bash
export BEDROCK_MODEL_ID="us.anthropic.claude-3-5-sonnet-20241022-v2:0"
```

## IAM Permissions
Ensure your IAM role has permission to invoke Nova Lite:
```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
}
```

## Cost Comparison
- **Nova Lite**: Better quality than Nova Micro, still cost-effective
- **Nova Micro**: Most cost-effective but lower quality
- **Claude Sonnet**: Higher cost but may provide more sophisticated responses

Choose based on your quality/cost requirements.