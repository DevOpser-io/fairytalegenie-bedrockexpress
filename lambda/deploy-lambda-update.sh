#!/bin/bash

# Script to update the Lambda function with Nova Canvas changes
# Make sure you have AWS CLI configured with appropriate permissions

set -e

echo "🚀 Updating Fairytale Genie Lambda function to use Nova Canvas..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/image-generator"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create deployment package
echo "📦 Creating deployment package..."
rm -f ../image-generator.zip
zip -r ../image-generator.zip . -x "*.git*"

# Update Lambda function
echo "⬆️  Updating Lambda function..."
aws lambda update-function-code \
    --function-name fairytalegenie-image-generator \
    --zip-file fileb://../image-generator.zip

echo "✅ Lambda function updated successfully!"
echo ""
echo "📝 Nova Canvas is now active for image generation."
echo "   - Model: amazon.nova-canvas-v1:0"
echo "   - Image size: 768x768"
echo ""
echo "🔍 To verify the update:"
echo "   1. Create a new story through the web interface"
echo "   2. Check CloudWatch logs for 'Calling Amazon Nova Canvas' messages"
echo "   3. Monitor for successful image generation"

# Clean up
rm -f ../image-generator.zip