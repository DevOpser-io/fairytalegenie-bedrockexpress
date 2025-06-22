/**
 * Email Service
 * Provides email functionality using nodemailer with AWS Secrets Manager integration
 */
console.log('========== EMAIL SERVICE LOADING ==========');

// Use direct SMTP configuration for development
const USE_DIRECT_SMTP = true;
console.log('USE_DIRECT_SMTP:', USE_DIRECT_SMTP);

console.log('Email environment variables:', {
  MAIL_SERVER: process.env.MAIL_SERVER,
  MAIL_PORT: process.env.MAIL_PORT,
  MAIL_USE_TLS: process.env.MAIL_USE_TLS,
  MAIL_USERNAME: process.env.MAIL_USERNAME,
  MAIL_PASSWORD_SECRET_NAME: process.env.MAIL_PASSWORD_SECRET_NAME,
  MAIL_DEFAULT_SENDER: process.env.MAIL_DEFAULT_SENDER,
  NODE_ENV: process.env.NODE_ENV
});

const nodemailer = require('nodemailer');
const config = require('../config');
console.log('Config loaded:', {
  email: config.email,
  aws: config.aws
});

const { getSecret } = require('./secretsManager');
console.log('Secrets manager loaded');

// Email transporter instance
let transporter = null;

/**
 * Initialize the email transporter with credentials from AWS Secrets Manager
 */
async function initializeEmailTransporter() {
  try {
    console.log('Initializing email transporter with AWS Secrets Manager...');
    
    // Get email configuration from AWS Secrets Manager using secret names from .env file
    try {
      console.log('Retrieving email configuration from AWS Secrets Manager...');
      
      // Get email configuration from AWS Secrets Manager
      let mailServer, mailPort, mailUseTls, mailUsername, mailPassword, mailDefaultSender;
      
      try {
        mailServer = await getSecret(process.env.MAIL_SERVER);
        console.log(`Retrieved mail server: ${mailServer}`);
      } catch (error) {
        console.error(`Failed to retrieve mail server: ${error.message}`);
        throw error; // Let the outer catch handle this
      }
      
      try {
        mailPort = parseInt(await getSecret(process.env.MAIL_PORT));
        console.log(`Retrieved mail port: ${mailPort}`);
      } catch (error) {
        console.error(`Failed to retrieve mail port: ${error.message}`);
        throw error; // Let the outer catch handle this
      }
      
      try {
        mailUseTls = (await getSecret(process.env.MAIL_USE_TLS)).toLowerCase() === 'true';
        console.log(`Retrieved mail TLS setting: ${mailUseTls}`);
      } catch (error) {
        console.error(`Failed to retrieve mail TLS setting: ${error.message}`);
        throw error; // Let the outer catch handle this
      }
      
      try {
        mailUsername = await getSecret(process.env.MAIL_USERNAME);
        console.log(`Retrieved mail username: ${mailUsername}`);
      } catch (error) {
        console.error(`Failed to retrieve mail username: ${error.message}`);
        throw error; // Let the outer catch handle this
      }
      
      try {
        mailPassword = await getSecret(process.env.MAIL_PASSWORD_SECRET_NAME);
        console.log('Retrieved mail password successfully');
      } catch (error) {
        console.error(`Failed to retrieve mail password: ${error.message}`);
        throw error; // Let the outer catch handle this
      }
      
      try {
        mailDefaultSender = await getSecret(process.env.MAIL_DEFAULT_SENDER);
        console.log(`Retrieved mail default sender: ${mailDefaultSender}`);
      } catch (error) {
        console.error(`Failed to retrieve mail default sender: ${error.message}`);
        // Use username as fallback
        mailDefaultSender = mailUsername;
      }
      
      console.log(`Email config retrieved - Server: ${mailServer}, Port: ${mailPort}, User: ${mailUsername}`);
      
      // Create nodemailer transporter
      transporter = nodemailer.createTransport({
        host: mailServer,
        port: mailPort,
        secure: mailPort === 465, // true for 465, false for other ports
        auth: {
          user: mailUsername,
          pass: mailPassword
        },
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: false
        }
      });
      
      try {
        // Verify connection
        await transporter.verify();
        console.log('Email transporter initialized successfully with AWS Secrets Manager config');
        
        // Store default sender for later use
        config.email.resolvedDefaultSender = mailDefaultSender;
        
        return true;
      } catch (verifyError) {
        console.error('Email transporter verification failed:', verifyError);
        throw verifyError; // Let the outer catch handle this
      }
    } catch (secretsError) {
      console.error('Error retrieving email configuration from AWS Secrets Manager:', secretsError);
      throw secretsError;
    }
  } catch (error) {
    console.error('Failed to initialize email transporter:', error);
    // Create a mock transporter for fallback
    createMockTransporter();
    return false;
  }
}

/**
 * Create a mock transporter for development or when real email fails
 */
function createMockTransporter() {
  console.log('Creating mock email transporter...');
  transporter = {
    sendMail: async (options) => {
      console.log('========================================');
      console.log('EMAIL SENDING (MOCK)');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('Body:', options.text || options.html);
      console.log('========================================');
      return { messageId: 'mock-email-id-' + Date.now() };
    },
    verify: async () => true // Mock verify method
  };
  console.log('Mock email transporter created');
}

/**
 * Send an email
 * @param {Object} options - Email options (to, subject, text/html)
 * @returns {Promise<Object>} - Email send result
 */
async function sendEmail(options) {
  if (!transporter) {
    await initializeEmailTransporter();
  }
  
  // Set default sender if not provided
  if (!options.from && config.email.resolvedDefaultSender) {
    options.from = config.email.resolvedDefaultSender;
  }
  
  try {
    return await transporter.sendMail(options);
  } catch (error) {
    console.error('Error sending email:', error);
    // If sending fails, recreate the transporter and try again with mock
    createMockTransporter();
    return await transporter.sendMail(options);
  }
}

// Initialize on module load
console.log('Email service initializing with environment variables:', {
  MAIL_SERVER: process.env.MAIL_SERVER,
  MAIL_PORT: process.env.MAIL_PORT,
  MAIL_USE_TLS: process.env.MAIL_USE_TLS,
  MAIL_USERNAME: process.env.MAIL_USERNAME,
  MAIL_PASSWORD_SECRET_NAME: process.env.MAIL_PASSWORD_SECRET_NAME,
  MAIL_DEFAULT_SENDER: process.env.MAIL_DEFAULT_SENDER,
  NODE_ENV: process.env.NODE_ENV,
  AWS_REGION: process.env.AWS_REGION || config.aws.region,
  AWS_PROFILE: process.env.AWS_PROFILE,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set'
});

// Try to initialize with real email credentials
initializeEmailTransporter()
  .then(success => {
    if (success) {
      console.log('Successfully initialized real email transporter');
    } else {
      console.log('Failed to initialize real email transporter, using mock');
      createMockTransporter();
    }
  })
  .catch(err => {
    console.error('Email service initialization failed:', err);
    console.error('Error details:', err.stack);
    console.error('AWS SDK version:', require('@aws-sdk/client-secrets-manager/package.json').version);
    createMockTransporter(); // Ensure we have a fallback
  });

module.exports = {
  sendEmail,
  initializeEmailTransporter
};
