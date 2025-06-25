// Note: AWS Comprehend integration commented out due to permission issues
// const AWS = require('aws-sdk');
// const comprehend = new AWS.Comprehend({
//   region: process.env.AWS_REGION || 'us-east-1'
// });

// List of truly inappropriate keywords for children's content
// Keep this minimal and focused on genuinely harmful content
const BLOCKED_KEYWORDS = [
  'murder', 'suicide', 'rape', 'torture', 'terrorism',
  'drugs', 'cocaine', 'heroin', 'pornography', 'explicit sexual',
  'graphic violence', 'self-harm', 'nazi', 'racist slurs'
];

// Moderate content for child safety
async function moderateContent({ keywords, notes }) {
  try {
    // Check for blocked keywords
    const allText = [...(keywords || []), notes || ''].join(' ').toLowerCase();
    
    for (const blocked of BLOCKED_KEYWORDS) {
      if (allText.includes(blocked.toLowerCase())) {
        return {
          isAppropriate: false,
          reason: `Content contains inappropriate material`
        };
      }
    }
    
    // Basic checks for common inappropriate patterns
    const inappropriatePatterns = [
      /\b(xxx|nsfw)\b/i,
      /\b(kill.*yourself|suicide.*methods)\b/i,
      /\b(how.*to.*die|ways.*to.*hurt)\b/i
    ];
    
    for (const pattern of inappropriatePatterns) {
      if (pattern.test(allText)) {
        return {
          isAppropriate: false,
          reason: 'Content contains inappropriate material'
        };
      }
    }
    
    // Basic PII detection patterns
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ // Phone number
    ];
    
    for (const pattern of piiPatterns) {
      if (pattern.test(allText)) {
        return {
          isAppropriate: false,
          reason: 'Content contains personal information'
        };
      }
    }
    
    // Allow most content through, including educational content about behavior
    return {
      isAppropriate: true
    };
    
  } catch (error) {
    console.error('Moderation error:', error);
    // For MVP, allow content through if moderation fails
    console.log('Moderation failed, allowing content through for MVP');
    return {
      isAppropriate: true
    };
  }
}

// Moderate generated images (placeholder for future implementation)
async function moderateImage(_imageBuffer) {
  // TODO: Implement AWS Rekognition moderation
  // For MVP, we rely on prompt engineering to ensure safe content
  return {
    isAppropriate: true
  };
}

module.exports = {
  moderateContent,
  moderateImage
};