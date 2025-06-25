# Nova Canvas Integration Update

## Overview
The Fairytale Genie image generation has been updated to use **Amazon Nova Canvas** (`amazon.nova-canvas-v1:0`) instead of Stable Diffusion XL.

## What Changed
1. **Lambda Function** (`lambda/image-generator/index.js`):
   - Now uses `generateImageNova()` function
   - Calls Amazon Nova Canvas model for image generation
   - Maintains same image parameters (768x768, child-friendly prompts)

2. **Documentation** (`DEPLOYMENT_GUIDE.md`):
   - Updated to reflect Nova Canvas as the primary model

## Deployment Instructions

### Quick Deploy (if Lambda already exists)
```bash
cd lambda
./deploy-lambda-update.sh
```

### Manual Deploy
```bash
cd lambda/image-generator
npm install
zip -r ../image-generator.zip .
aws lambda update-function-code \
  --function-name fairytalegenie-image-generator \
  --zip-file fileb://../image-generator.zip
```

## Benefits of Nova Canvas
- Native AWS model (no third-party dependencies)
- Consistent pricing (~$0.04 per image)
- Better integration with AWS services
- Optimized for illustration-style images

## Testing
After deployment:
1. Create a new story through the web interface
2. Check CloudWatch logs for "Calling Amazon Nova Canvas" messages
3. Verify images are generated and stored in S3

## Rollback (if needed)
To switch back to Stable Diffusion XL:
1. Edit `lambda/image-generator/index.js`
2. Change line 33 from `generateImageNova` to `generateImage`
3. Redeploy using the script above