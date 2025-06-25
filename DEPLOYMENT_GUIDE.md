# Fairytale Genie - Image Generation Deployment Guide

## 🎨 AWS Setup Required for Image Generation

### 1. Enable Bedrock Models

**In AWS Console → Bedrock → Model Access**, enable:
- ✅ **Amazon Nova Canvas** (`amazon.nova-canvas-v1:0`) *(Currently in use)*
- ✅ **Stable Diffusion XL** (`stability.stable-diffusion-xl-v1`) *(Alternative option)*
- ✅ **Amazon Nova Pro** (`amazon.nova-pro-v1:0`) *(Multi-modal option)*

### 2. Create AWS Infrastructure

```bash
# Replace YOUR_SUFFIX with something unique (e.g., your-name-dev)
export SUFFIX="your-name-dev"
export REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. Create S3 bucket for story images
aws s3 mb s3://fairytalegenie-stories-${SUFFIX} --region ${REGION}

# 2. Create SQS queue for image generation
aws sqs create-queue \
  --queue-name fairytalegenie-image-generation \
  --region ${REGION} \
  --attributes VisibilityTimeoutSeconds=300,MessageRetentionPeriod=1209600

# 3. Create DLQ for failed jobs (optional but recommended)
aws sqs create-queue \
  --queue-name fairytalegenie-image-generation-dlq \
  --region ${REGION}

# 4. Get queue URL
export QUEUE_URL=$(aws sqs get-queue-url --queue-name fairytalegenie-image-generation --region ${REGION} --query QueueUrl --output text)
echo "Queue URL: ${QUEUE_URL}"
```

### 3. Deploy Lambda Function

```bash
# Navigate to Lambda function directory
cd lambda/image-generator

# Install dependencies
npm install

# Create deployment package
zip -r ../image-generator.zip .

# Create Lambda function
aws lambda create-function \
  --function-name fairytalegenie-image-generator \
  --runtime nodejs18.x \
  --role arn:aws:iam::${ACCOUNT_ID}:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://../image-generator.zip \
  --timeout 300 \
  --memory-size 1024 \
  --environment Variables="{
    S3_BUCKET_NAME=fairytalegenie-stories-${SUFFIX},
    AWS_REGION=${REGION}
  }"

# Connect SQS trigger to Lambda
aws lambda create-event-source-mapping \
  --event-source-arn arn:aws:sqs:${REGION}:${ACCOUNT_ID}:fairytalegenie-image-generation \
  --function-name fairytalegenie-image-generator \
  --batch-size 1
```

### 4. IAM Permissions

Your Lambda execution role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:fairytalegenie-image-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/stability.stable-diffusion-xl-v1",
        "arn:aws:bedrock:*::foundation-model/amazon.nova-canvas-v1:0"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::fairytalegenie-stories-*/*"
    }
  ]
}
```

Your main application role needs:
```json
{
  "Effect": "Allow",
  "Action": [
    "sqs:SendMessage"
  ],
  "Resource": "arn:aws:sqs:*:*:fairytalegenie-image-*"
}
```

### 5. Optional: CloudFront for Image Delivery

```bash
# Create CloudFront distribution for faster image delivery
aws cloudfront create-distribution \
  --distribution-config '{
    "CallerReference": "fairytale-images-'$(date +%s)'",
    "Origins": {
      "Quantity": 1,
      "Items": [{
        "Id": "S3-fairytalegenie-stories",
        "DomainName": "fairytalegenie-stories-'${SUFFIX}'.s3.'${REGION}'.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "S3-fairytalegenie-stories",
      "ViewerProtocolPolicy": "redirect-to-https",
      "TrustedSigners": {
        "Enabled": false,
        "Quantity": 0
      },
      "ForwardedValues": {
        "QueryString": false,
        "Cookies": {"Forward": "none"}
      },
      "MinTTL": 86400
    },
    "Comment": "Fairytale Genie Story Images",
    "Enabled": true
  }'
```

### 6. Update Environment Variables

In your `.env` file:
```bash
# Update these with your actual values
S3_BUCKET_NAME=fairytalegenie-stories-your-suffix
IMAGE_GENERATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/fairytalegenie-image-generation
CLOUDFRONT_DISTRIBUTION_URL=https://YOUR_CLOUDFRONT_ID.cloudfront.net
```

### 7. Test Image Generation

1. Create a story through the web interface
2. Check CloudWatch logs for the Lambda function
3. Verify images appear in your S3 bucket
4. Refresh the story page to see generated images

## 🔧 Troubleshooting

**Lambda timeouts**: Increase memory and timeout (image generation can take 30-60 seconds)

**Permission errors**: Ensure both Lambda and main app roles have correct Bedrock permissions

**Images not appearing**: Check S3 bucket permissions and CloudFront cache settings

**Queue not processing**: Verify SQS trigger is connected to Lambda function

## 💰 Cost Estimation

- **Stable Diffusion XL**: ~$0.04 per image
- **Nova Canvas**: ~$0.04 per image  
- **S3 storage**: ~$0.02/GB/month
- **Lambda**: ~$0.000002 per request
- **SQS**: ~$0.0000004 per request

**Estimated cost per story**: ~$0.20 (5 images × $0.04 each)