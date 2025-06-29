const express = require('express');
const router = express.Router();
const passport = require('passport');
// Passport is initialized and session is used in server.js, not here.
const db = require('../models');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const redisClient = require('../services/redisClient');
const qrcode = require('qrcode');
const speakeasy = require('speakeasy');
const url = require('url');

// Ensure database is initialized before accessing models
async function ensureDatabaseInitialized() {
  if (process.env.NODE_ENV === 'production' && typeof db.initializeDatabase === 'function') {
    console.log('Ensuring database is initialized before accessing models');
    await db.initializeDatabase();
  }
  return db.User;
}

// Add local body-parser middleware for auth routes
// This is needed because the global body-parser is added after AdminJS setup
router.use(express.json());
router.use(express.urlencoded({ extended: false }));

// GET /auth/login
router.get('/login', (req, res) => {
  // Render login page with flash messages if available
  const message = req.flash('message') || req.query.message;
  const error = req.flash('error') || req.query.error;
  
  res.render('login', {
    error: error,
    message: message
  });
});

// POST /auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8, max: 72 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.render('login', { 
          error: errors.array().map(e => e.msg).join(', '),
          email: req.body.email 
        });
      }
      
      const { email, password, remember } = req.body;
      const User = await ensureDatabaseInitialized();
      const user = await User.findOne({ where: { email } });
      
      // Check credentials
      if (!user || !(await user.checkPassword(password))) {
        return res.render('login', { 
          error: 'Please check your login details.',
          email: req.body.email 
        });
      }
      
      // Check email verification
      if (!user.emailVerified) {
        return res.render('login', { 
          error: 'Please verify your email first.',
          email: req.body.email 
        });
      }
      
            // MFA logic matching devopserportal-cicd
      if (!user.mfaEnabled) {
        // First time login needs MFA setup
        console.log(`User ${user.id} logged in successfully, needs MFA setup`);
        console.log(`Session ID before login: ${req.session.id}`);
        
        req.login(user, function(err) {
          if (err) {
            console.error('Login error:', err);
            return res.render('login', { error: 'Authentication failed', email: req.body.email });
          }
          
          console.log(`Session ID after login: ${req.session.id}`);
          console.log(`Setting mfaUserId=${user.id} in session`);
          
          req.session.mfaUserId = user.id;
          req.session.rememberMe = !!remember;
          req.flash('info', 'Please set up two-factor authentication to secure your account.');
          
          // Save session before redirect to ensure data is stored
          req.session.save(function(err) {
            if (err) {
              console.error('Session save error:', err);
            }
            console.log(`Redirecting to /auth/mfa-setup with session ID: ${req.session.id}`);
            return res.redirect('/auth/mfa-setup');
          });
        });
      } else {
        // User has MFA enabled: log them in with Passport but require MFA verification
        console.log(`User ${user.id} logged in successfully, has MFA enabled`);
        console.log(`Session ID before login: ${req.session.id}`);
        
        req.login(user, function(err) {
          if (err) {
            console.error('Login error:', err);
            return res.render('login', { error: 'Authentication failed', email: req.body.email });
          }
          
          console.log(`Session ID after login: ${req.session.id}`);
          console.log(`Setting mfaUserId=${user.id} in session`);
          
          req.session.mfaUserId = user.id;
          req.session.rememberMe = !!remember;
          
          // Clear any existing mfaVerified flag to ensure verification is required
          if (req.session.mfaVerified) {
            delete req.session.mfaVerified;
          }
          
          // Save session before redirect to ensure data is stored
          req.session.save(function(err) {
            if (err) {
              console.error('Session save error:', err);
            }
            console.log(`Redirecting to /auth/mfa-verify with session ID: ${req.session.id}`);
            return res.redirect('/auth/mfa-verify');
          });
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      return res.render('login', { 
        error: 'An error occurred during login. Please try again.',
        email: req.body.email 
      });
    }
  }
);

// GET /auth/signup
router.get('/signup', (req, res) => {
  // Render signup page
  res.render('signup', {
    error: req.query.error,
    message: req.query.message
  });
});

// POST /auth/signup
// Import email service for sending verification emails
const { sendEmail } = require('../services/emailService');

/**
 * Generate a full URL based on the current request and path
 * This mimics Flask's url_for with _external=True by using the request's protocol and host
 * @param {Object} req - Express request object
 * @param {String} path - URL path (should start with /)
 * @returns {String} - Full URL including protocol and host
 */
function getFullUrl(req, path) {
  // Get protocol (http or https)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  
  // Get host from headers (includes port if specified)
  const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname || 'localhost:8000';
  
  // Combine to form the base URL
  const baseUrl = `${protocol}://${host}`;
  
  // Join with the path
  return url.resolve(baseUrl, path);
}

// Helper for Redis-based rate limit (2min per email per address)
async function canSendVerification(email) {
  const key = `signup_email_limit:${email}`;
  const exists = await redisClient.client.get(key);
  if (exists) return false;
  await redisClient.client.setEx(key, 120, '1'); // 2min TTL
  return true;
}

router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('name').isLength({ min: 1, max: 100 }),
    body('password').isLength({ min: 8, max: 72 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Render the signup page with validation errors
        return res.render('signup', { 
          error: errors.array().map(e => e.msg).join(', '),
          name: req.body.name,
          email: req.body.email
        });
      }
      
      const { email, name, password } = req.body;
      console.log(`Attempting to sign up user: ${email}`);
      
      // Normalize the email to handle aliases (e.g., user+tag@gmail.com)
      // For Gmail and similar providers, the part after + is an alias
      let normalizedEmail = email.toLowerCase();
      
      // Extract the base email without the alias part
      if (normalizedEmail.includes('+')) {
        const atIndex = normalizedEmail.lastIndexOf('@');
        const plusIndex = normalizedEmail.indexOf('+');
        
        if (plusIndex > 0 && plusIndex < atIndex) {
          normalizedEmail = normalizedEmail.substring(0, plusIndex) + normalizedEmail.substring(atIndex);
          console.log(`Normalized email for comparison: ${normalizedEmail}`);
        }
      }
      
      // Ensure database is initialized before accessing User model
      // Ensure database is initialized and get User model
      const User = await ensureDatabaseInitialized();
      
      // Check if user already exists with the base email (without alias)
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { email: email },                // Check exact match
            { email: normalizedEmail }       // Check normalized version
          ]
        }
      });
      
      // Check if user already exists
      if (existingUser) {
        console.log(`User with email ${normalizedEmail} already exists`);
        
        // Check if the email is verified
        if (!existingUser.emailVerified) {
          // Email exists but isn't verified - redirect to resend verification page
          req.flash('message', 'Your account exists but the email is not verified. Please verify your email to continue.');
          return res.redirect('/auth/resend-verification?email=' + encodeURIComponent(email));
        } else {
          // Email exists and is verified - suggest login
          return res.render('signup', { 
            error: `This email address is already registered. Please use a different email or try to log in.`,
            name: req.body.name
          });
        }
      }
      
      // Check rate limiting
      if (!(await canSendVerification(email))) {
        return res.render('signup', { 
          error: 'Please wait before requesting another verification email.',
          name: req.body.name,
          email: req.body.email
        });
      }
      
      // Create verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      try {
        // Ensure database is initialized before creating user
        const User = await ensureDatabaseInitialized();
        
        // Create new user
        console.log('Creating new user...');
        const user = User.build({ 
          email, 
          name, 
          emailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationSentAt: new Date()
        });
        
        // Set password (must be done after build but before save)
        console.log('Setting password...');
        if (typeof user.setPassword !== 'function') {
          console.error('Error: user.setPassword is not a function');
          console.log('User model:', user);
          return res.render('signup', { 
            error: 'Failed to set password - internal error',
            name: req.body.name,
            email: req.body.email
          });
        }
        
        await user.setPassword(password);
        
        // Save the user to the database
        console.log('Saving user to database...');
        await user.save();
        console.log(`User saved with ID: ${user.id}`);
        
        // Send verification email
        console.log('Sending verification email...');
        const verificationUrl = getFullUrl(req, `/auth/verify-email/${verificationToken}`);
        
        try {
          await sendEmail({
            to: email,
            subject: 'Verify your email address',
            html: `<p>Please verify your email address by clicking the link below:</p>
                  <p><a href="${verificationUrl}">${verificationUrl}</a></p>
                  <p>This link will expire in 24 hours.</p>`
          });
          console.log('Verification email sent successfully');
        } catch (emailError) {
          console.error('Failed to send verification email:', emailError);
          // Continue with the response even if email fails
          // We don't want to block user registration if email sending fails
        }
        
        // Redirect to login page with success message
        req.flash('message', 'Account created! Please check your email to verify your account.');
        return res.redirect('/auth/login');
      } catch (innerErr) {
        console.error('Error during user creation or email sending:', innerErr);
        return res.render('signup', { 
          error: `An error occurred during signup: ${innerErr.message}`,
          name: req.body.name,
          email: req.body.email
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      return res.render('signup', { 
        error: `An error occurred during signup: ${error.message}`,
        name: req.body.name,
        email: req.body.email 
      });
    }
  }
);

// GET /auth/resend-verification - Show form to resend verification email
router.get('/resend-verification', (req, res) => {
  // Pass any flash messages and the email from query string to the template
  const message = req.flash('message') || req.query.message;
  const error = req.flash('error') || req.query.error;
  
  res.render('resend_verification', {
    error: error,
    message: message,
    email: req.query.email || ''
  });
});

// POST /auth/resend-verification - Handle resend verification email request
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Ensure database is initialized before accessing User model
    const User = await ensureDatabaseInitialized();
    
    // Find user by email
    const user = await User.findOne({ where: { email } });
    
    // Don't reveal if user exists or not for security
    if (!user) {
      return res.status(200).json({ 
        message: 'If your email is registered and not verified, a verification email has been sent.'
      });
    }
    
    // Check if email is already verified
    if (user.emailVerified) {
      return res.status(400).json({ 
        error: 'Your email is already verified. Please log in.'
      });
    }
    
    // Check rate limiting
    if (!(await canSendVerification(email))) {
      return res.status(429).json({ 
        error: 'Please wait before requesting another verification email.'
      });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationSentAt = new Date();
    await user.save();
    
    // Send verification email
    const verificationUrl = getFullUrl(req, `/auth/verify-email/${verificationToken}`);
    
    try {
      await sendEmail({
        to: email,
        subject: 'Verify your email address',
        html: `<p>Please verify your email address by clicking the link below:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
              <p>This link will expire in 24 hours.</p>`
      });
      console.log(`Verification email resent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return res.status(500).json({ 
        error: 'Failed to send verification email. Please try again later.'
      });
    }
    
    return res.status(200).json({ 
      message: 'Verification email sent. Please check your inbox.'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ 
      error: 'An error occurred while processing your request.'
    });
  }
});

// GET /auth/verify-email/:token
router.get('/verify-email/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    
    // Ensure database is initialized before accessing User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findOne({ where: { emailVerificationToken: token } });
    if (!user) {
      return res.status(400).render('verify_email_result', { success: false, message: 'Invalid or expired verification token.' });
    }
    // Check if token expired (24h)
    const sentAt = user.emailVerificationSentAt;
    if (!sentAt || (Date.now() - new Date(sentAt).getTime()) > 24 * 60 * 60 * 1000) {
      user.emailVerificationToken = null;
      user.emailVerificationSentAt = null;
      await user.save();
      return res.status(400).render('verify_email_result', { success: false, message: 'Verification link has expired. Please request a new one.' });
    }
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationSentAt = null;
    await user.save();
    return res.render('verify_email_result', { success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

// GET /auth/mfa-setup - Display MFA setup page
router.get('/mfa-setup', async (req, res, next) => {
  try {
    const userId = req.session.mfaUserId;
    if (!userId) return res.redirect('/auth/login');
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findByPk(userId);
    if (!user) return res.redirect('/auth/login');
    if (user.mfaEnabled) return res.redirect('/auth/mfa-verify');
    
    // Only generate the secret if it doesn't exist yet
    if (!user.mfaSecret) {
      user.generateMfaSecret();
      await user.save();
      console.log('Generated new MFA secret for setup:', user.mfaSecret);
    }
    const otpauthUrl = user.getMfaUri();
    console.log('Generated otpauth URL:', otpauthUrl);
    
    // Generate QR code with specific options to prevent double scanning
    const qr = await qrcode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      scale: 4
    });
    
    const csrfToken = req.csrfToken ? req.csrfToken() : '';
    console.log('Rendering MFA setup page');
    return res.render('mfa_setup', { qr, secret: user.mfaSecret, csrfToken });
  } catch (err) { next(err); }
});

// MFA Setup - POST (verify code)
router.post('/mfa-setup', async (req, res, next) => {
  console.log('POST /mfa-setup handler entered');
  try {
    const userId = req.session.mfaUserId;
    if (!userId) return res.redirect('/auth/login');
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findByPk(userId);
    if (!user) return res.redirect('/auth/login');
    if (user.mfaEnabled) return res.redirect('/auth/mfa-verify');
    
    // Accept both JSON and form submissions
    console.log('Request body:', req.body);
    const verification_code = req.body.verification_code || req.body.token;
    console.log('Verification code:', verification_code);
    
    if (!verification_code) {
      console.log('No verification code provided');
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        const csrfToken = req.csrfToken ? req.csrfToken() : '';
        return res.status(400).json({ error: 'Please enter the code from your authenticator app.', csrfToken });
      } else {
        req.flash('error', 'Please enter the code from your authenticator app.');
        return res.redirect('/auth/mfa-setup');
      }
    }
    
    console.log('Verifying TOTP with secret:', user.mfaSecret);
    const isValid = user.verifyTotp(verification_code);
    console.log('TOTP verification result:', isValid);
    
    // No more lenient verification - only accept valid TOTP codes
    
    if (!isValid) {
      console.log('Invalid verification code');
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        const csrfToken = req.csrfToken ? req.csrfToken() : '';
        return res.status(400).json({ error: 'Invalid code. Try again.', csrfToken });
      } else {
        req.flash('error', 'Invalid verification code. Please try again.');
        return res.redirect('/auth/mfa-setup');
      }
    }
    user.mfaEnabled = true;
    user.isMfaSetupComplete = true;
    user.hasAuthenticator = true;
    const backupCodes = await user.generateBackupCodes();
    await user.save();
    console.log('About to call req.login in /mfa-setup');
    let loginCalled = false;
    try {
      req.login(user, function(err) {
        loginCalled = true;
        if (err) {
          console.error('req.login error in /mfa-setup:', err);
          return next(err);
        }
        req.session.mfaBackupCodes = backupCodes;
        req.session.mfaVerified = true; // Mark MFA as verified in this session
        console.log('MFA setup complete, checking request type');
        
        // Check if this is a request from the account page
        if (req.body.returnToAccount) {
          console.log('Returning to account page after MFA setup');
          req.flash('message', 'Authenticator app has been set up successfully.');
          return res.redirect('/auth/account');
        }
        // Check if this is an AJAX request or a form submission
        else if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
          console.log('Sending JSON success response');
          return res.status(200).json({ success: true, redirect: '/auth/mfa-backup-codes' });
        } else {
          console.log('Redirecting to backup codes page');
          return res.redirect('/auth/mfa-backup-codes');
        }
      });
    } catch (err) {
      console.error('Exception thrown by req.login:', err);
      return next(err);
    }
    setTimeout(() => {
      if (!loginCalled) {
        console.error('req.login callback never called after 2 seconds!');
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Internal server error: login did not complete.' });
        }
      }
    }, 2000);
  } catch (err) { next(err); }
});

// MFA Backup Codes - GET
router.get('/mfa-backup-codes', async (req, res) => {
  const backupCodes = req.session.mfaBackupCodes;
  if (!backupCodes) return res.redirect('/auth/login');
  delete req.session.mfaBackupCodes;
  
  // Preserve returnTo for after viewing backup codes
  const returnUrl = req.session.returnTo || '/chat';
  res.render('mfa_backup_codes', { backupCodes, returnUrl });
});

// GET /auth/forgot-password - Show forgot password form
router.get('/forgot-password', (req, res) => {
  const message = req.flash('message') || req.query.message;
  const error = req.flash('error') || req.query.error;
  
  res.render('forgot_password', {
    error: error,
    message: message
  });
});

// POST /auth/forgot-password - Handle forgot password request
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      req.flash('error', 'Email is required');
      return res.redirect('/auth/forgot-password');
    }
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    // Find user by email
    const user = await User.findOne({ where: { email } });
    
    // Don't reveal if user exists or not for security
    if (!user) {
      req.flash('message', 'If your email is registered, you will receive a password reset link shortly.');
      return res.redirect('/auth/login');
    }
    
    // Check if email is verified
    if (!user.emailVerified) {
      req.flash('error', 'Your email is not verified. Please verify your email first.');
      return res.redirect('/auth/resend-verification?email=' + encodeURIComponent(email));
    }
    
    // Check rate limiting
    const rateLimitKey = `password_reset_limit:${email}`;
    const lastSent = await redisClient.client.get(rateLimitKey);
    
    if (lastSent) {
      req.flash('error', 'Please wait before requesting another password reset email.');
      return res.redirect('/auth/forgot-password');
    }
    
    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    
    // Set rate limit (2 minutes)
    await redisClient.client.set(rateLimitKey, Date.now().toString(), {
      EX: 120 // 2 minutes expiration
    });
    
    // Generate reset token and URL
    const resetUrl = getFullUrl(req, `/auth/reset-password/${resetToken}`);
    
    // Send password reset email
    try {
      await sendEmail({
        to: email,
        subject: 'Reset your password',
        html: `<p>You requested a password reset. Please click the link below to reset your password:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <p>This link will expire in 1 hour.</p>
              <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      req.flash('error', 'Failed to send password reset email. Please try again later.');
      return res.redirect('/auth/forgot-password');
    }
    
    req.flash('message', 'Password reset email sent. Please check your inbox.');
    return res.redirect('/auth/login');
  } catch (error) {
    console.error('Forgot password error:', error);
    req.flash('error', 'An error occurred while processing your request.');
    return res.redirect('/auth/forgot-password');
  }
});

// GET /auth/reset-password/:token - Show reset password form
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    // Find user with this reset token and check if it's still valid
    const user = await User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: new Date() } // Token hasn't expired
      }
    });
    
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }
    
    // Render reset password form
    res.render('reset_password', {
      token: token,
      error: req.flash('error'),
      message: req.flash('message')
    });
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error', 'An error occurred while processing your request.');
    return res.redirect('/auth/forgot-password');
  }
});

// POST /auth/reset-password/:token - Handle password reset
router.post('/reset-password/:token', [
  body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect(`/auth/reset-password/${req.params.token}`);
    }
    
    const { token } = req.params;
    const { password } = req.body;
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    // Find user with this reset token and check if it's still valid
    const user = await User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: new Date() } // Token hasn't expired
      }
    });
    
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }
    
    // Update password
    await user.setPassword(password);
    
    // Clear reset token fields
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    
    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your password has been changed',
        html: `<p>This is a confirmation that the password for your account ${user.email} has just been changed.</p>`
      });
    } catch (emailError) {
      console.error('Failed to send password change confirmation email:', emailError);
      // Continue with the response even if email fails
    }
    
    req.flash('message', 'Password has been reset successfully. You can now log in with your new password.');
    return res.redirect('/auth/login');
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error', 'An error occurred while processing your request.');
    return res.redirect(`/auth/reset-password/${req.params.token}`);
  }
});

// Send MFA Code - POST
// NOTE: This route must NOT be protected by ensureMfaVerified middleware!
// It should be accessible to users who are logged in but have not yet completed MFA verification.
router.post('/send-mfa-code', async (req, res) => {
  console.log('DEBUG /send-mfa-code: Session:', req.session);
  console.log('DEBUG /send-mfa-code: mfaUserId:', req.session.mfaUserId);
  console.log('DEBUG /send-mfa-code: AJAX:', req.xhr, '| Accept:', req.headers.accept);

  try {
    // Get user from session
    const userId = req.session.mfaUserId;
    if (!userId) {
      // Always return JSON for AJAX requests
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.'
        });
      } else {
        // fallback for non-AJAX requests
        return res.redirect('/auth/mfa-verify');
      }
    }
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findByPk(userId);
    if (!user || !user.mfaEnabled) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(400).json({
          success: false,
          message: 'User not found or MFA not properly configured.'
        });
      } else {
        return res.redirect('/auth/mfa-verify');
      }
    }
    
    // Rate limiting
    const rateLimitKey = `mfa_rate_limit:${user.id}`;
    const lastSent = await redisClient.client.get(rateLimitKey);
    
    if (lastSent) {
      const timeSinceLastSent = Date.now() - parseInt(lastSent);
      if (timeSinceLastSent < 120000) { // 2 minutes cooldown
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil((120000 - timeSinceLastSent) / 1000)} seconds before requesting another code.`
        });
      }
    }
    
    // Generate TOTP code
    const secret = user.mfaSecret;
    if (!secret) {
      return res.status(400).json({
        success: false,
        message: 'MFA is not properly configured.'
      });
    }
    
    // Generate current TOTP code
    const totp = speakeasy.totp({
      secret: secret,
      encoding: 'base32'
    });
    
    // Send email with the code
    const { sendEmail } = require('../services/emailService');
    await sendEmail({
      to: user.email,
      subject: 'Your MFA Verification Code',
      text: `Your verification code is: ${totp}\n\nThis code will expire in 120 seconds (2 minutes).`,
      html: `<p>Your verification code is: <strong>${totp}</strong></p><p>This code will expire in 120 seconds (2 minutes).</p>`
    });
    
    // Set rate limit
    await redisClient.client.set(rateLimitKey, Date.now().toString(), {
      EX: 300 // 5 minutes expiration
    });
    
    return res.json({
      success: true,
      message: 'Verification code sent to your email.'
    });
    
  } catch (error) {
    console.error('Error sending MFA code:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send verification code. Please try again.'
    });
  }
});

// MFA Verify - GET
router.get('/mfa-verify', async (req, res, next) => {
  try {
    // Check if user is already authenticated with MFA verified
    if (req.isAuthenticated() && req.session.mfaVerified) {
      const returnUrl = req.session.returnTo || '/chat';
      delete req.session.returnTo;
      return res.redirect(returnUrl);
    }
    
    const userId = req.session.mfaUserId;
    if (!userId) return res.redirect('/auth/login');
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findByPk(userId);
    if (!user || !user.mfaEnabled) return res.redirect('/auth/login');
    const csrfToken = req.csrfToken ? req.csrfToken() : '';
    res.render('mfa_verify', { error: null, csrfToken });
  } catch (err) { next(err); }
});

// MFA Verify - POST
router.post('/mfa-verify', async (req, res, next) => {
  try {
    const userId = req.session.mfaUserId;
    if (!userId) {
      req.flash('error', 'Session expired. Please log in again.');
      return res.redirect('/auth/login');
    }
    
    // Ensure database is initialized and get User model
    const User = await ensureDatabaseInitialized();
    
    const user = await User.findByPk(userId);
    if (!user || !user.mfaEnabled) {
      req.flash('error', 'User not found or MFA not enabled.');
      return res.redirect('/auth/login');
    }
    
    const { token, backupCode, method } = req.body;
    let verified = false;
    
    if (method === 'backup' && backupCode) {
      verified = await user.verifyBackupCode(backupCode);
      if (verified) await user.save();
    } else if (token) {
      verified = user.verifyTotp(token);
    }
    
    if (!verified) {
      req.flash('error', 'Invalid verification code. Please try again.');
      return res.redirect('/auth/mfa-verify');
    }
    
    // Properly establish the authenticated session with Passport
    let loginCalled = false;
    req.login(user, function(err) {
      loginCalled = true;
      if (err) {
        console.error('req.login error in /mfa-verify:', err);
        return next(err);
      }
      
      req.session.mfaVerified = true; // Mark MFA as verified in this session
      
      if (req.session.rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      }
      
      // Clean up temporary session data
      delete req.session.mfaUserId;
      delete req.session.rememberMe;
      
      user.lastLogin = new Date();
      user.save().then(async () => {
        try {
          // Note: Removed automatic conversation creation for efficiency
          // Conversations are now created only when users send their first message
          
          // Redirect to the original URL if it exists, otherwise to chat
          const redirectUrl = req.session.returnTo || '/chat';
          delete req.session.returnTo; // Clean up
          
          // Save session before redirect to ensure all data is persisted
          console.log(`Saving session before redirect to ${redirectUrl}, session ID: ${req.session.id}`);
          console.log(`Session data: auth=${req.isAuthenticated()}, mfaVerified=${req.session.mfaVerified}`);
          
          req.session.save((err) => {
            if (err) {
              console.error('Error saving session before redirect:', err);
            }
            return res.redirect(redirectUrl);
          });
        } catch (convError) {
          console.error('Error creating initial conversation:', convError);
          // Continue with redirect even if conversation creation fails
          const redirectUrl = req.session.returnTo || '/chat';
          delete req.session.returnTo;
          
          // Save session before redirect to ensure all data is persisted
          console.log(`Saving session before redirect to ${redirectUrl} (fallback), session ID: ${req.session.id}`);
          
          req.session.save((err) => {
            if (err) {
              console.error('Error saving session before redirect (fallback):', err);
            }
            return res.redirect(redirectUrl);
          });
        }
      }).catch(saveErr => {
        console.error('Error saving user after MFA verify:', saveErr);
        const redirectUrl = req.session.returnTo || '/chat';
        
        // Save session before redirect to ensure all data is persisted
        console.log(`Saving session before redirect to ${redirectUrl} (error handler), session ID: ${req.session.id}`);
        
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session before redirect (error handler):', err);
          }
          return res.redirect(redirectUrl);
        });
      });
    });
    
    // Safety timeout in case req.login callback never fires
    setTimeout(() => {
      if (!loginCalled) {
        console.error('req.login callback never called after 2 seconds in /mfa-verify!');
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Internal server error: login did not complete.' });
        }
      }
    }, 2000);
  } catch (err) {
    console.error('MFA verification error:', err);
    req.flash('error', 'An error occurred during verification.');
    return res.redirect('/auth/mfa-verify');
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  // Clear MFA verification flag
  if (req.session) {
    delete req.session.mfaVerified;
  }
  // Logout using passport
  req.logout(function(err) {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/auth/login');
  });
});

// GET /logout - Added to support links in the UI
router.get('/logout', (req, res) => {
  console.log('GET logout route called');
  // Clear MFA verification flag
  if (req.session) {
    delete req.session.mfaVerified;
    // Also clear any conversation data
    if (req.session.conversationId) {
      console.log(`Clearing conversation data for ID: ${req.session.conversationId}`);
      delete req.session.conversationId;
    }
  }
  // Logout using passport
  req.logout(function(err) {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/auth/login');
  });
});

// GET /account - Account settings page
router.get('/account', (req, res) => {
  // Ensure user is authenticated and MFA verified
  if (!req.isAuthenticated() || !req.session.mfaVerified) {
    req.session.returnTo = '/auth/account';
    return res.redirect('/auth/login');
  }
  
  // Get current user
  const user = req.user;
  
  // Render account settings page
  res.render('account', {
    user: user,
    title: 'Account Settings',
    error: req.flash('error'),
    message: req.flash('message')
  });
});

// POST /remove-authenticator - Remove MFA authenticator
router.post('/remove-authenticator', async (req, res) => {
  // Ensure user is authenticated and MFA verified
  if (!req.isAuthenticated() || !req.session.mfaVerified) {
    req.session.returnTo = '/auth/account';
    return res.redirect('/auth/login');
  }
  
  try {
    const user = req.user;
    
    // Remove MFA configuration
    user.mfaSecret = null;
    user.hasAuthenticator = false;
    user.mfaEnabled = false;
    user.isMfaSetupComplete = false;
    
    // Save changes
    await user.save();
    
    // Flash success message
    req.flash('message', 'Authenticator app has been removed successfully.');
    
    // Redirect back to account page
    res.redirect('/auth/account');
  } catch (err) {
    console.error('Error removing authenticator:', err);
    req.flash('error', 'An error occurred while removing the authenticator app.');
    res.redirect('/auth/account');
  }
});

// GET /setup-authenticator - Setup MFA authenticator
router.get('/setup-authenticator', async (req, res) => {
  // Ensure user is authenticated
  if (!req.isAuthenticated()) {
    req.session.returnTo = '/auth/setup-authenticator';
    return res.redirect('/auth/login');
  }
  
  try {
    const user = req.user;
    
    // Generate MFA secret if not already set
    if (!user.mfaSecret) {
      user.generateMfaSecret();
      await user.save();
    }
    
    // Generate QR code
    const otpAuthUrl = user.getMfaUri('Bedrock Express');
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);
    
    // Render MFA setup page
    res.render('mfa_setup', {
      user: user,
      qrCode: qrCodeDataUrl,
      secret: user.mfaSecret,
      error: req.flash('error'),
      message: req.flash('message'),
      returnToAccount: true // Flag to indicate we should return to account page after setup
    });
  } catch (err) {
    console.error('Error setting up authenticator:', err);
    req.flash('error', 'An error occurred while setting up the authenticator app.');
    res.redirect('/auth/account');
  }
});

module.exports = router;
