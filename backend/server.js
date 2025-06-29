// Main server entry point
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const ejsLayouts = require('express-ejs-layouts');
const config = require('./config');

// Log the current environment during server startup
console.log('==================================================');
console.log(`SERVER: Current NODE_ENV is set to: ${process.env.NODE_ENV || 'undefined (defaulting to development)'}`);
console.log('==================================================');

// Import database and Redis services
const { initializeDatabase } = require('./models');
const redisClient = require('./services/redisClient');
const { configureSession } = require('./config/sessionStore');

// Import route modules
const apiRoutes = require('./routes/api');
const chatRoutes = require('./routes/chat');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminPanelRoutes = require('./routes/admin-panel');

const listEndpoints = require('express-list-endpoints');

// Initialize express app
const app = express();

// Trust proxy headers from ALB/ELB in production
if (process.env.NODE_ENV === 'production') {
  console.log('Setting trust proxy for production environment');
  app.set('trust proxy', 1); // Trust first proxy (ALB)
}

// Set up view engine for templates
app.set('views', path.join(__dirname, 'templates'));
app.set('view engine', 'ejs');

// Configure middleware
app.use(logger('dev'));
// IMPORTANT: body-parser middleware (express.json and express.urlencoded) must be added AFTER AdminJS setup
// to avoid compatibility issues with @adminjs/express
app.use(cookieParser());
app.use(cors());

// Add middleware to generate CSP nonce for each request
app.use((req, res, next) => {
  // Generate a new random nonce value for each request
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Add security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Main directives
      defaultSrc: ["'self'"],
      // Use nonce instead of unsafe-inline for scripts
      scriptSrc: [
        "'self'", 
        (req, res) => `'nonce-${res.locals.cspNonce}'`
      ],
      // Allow nonce-based inline styles for admin panel
      styleSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        "'sha256-KmuybpeIODTiqckdvTvlqNTvo/FCXZzUUlV4T9gJkoo='", // For bundle.js styles
        "'sha256-k0WLd3ulXPrpY7QZFCS+T0vX8ftqew4kV7Dl98xSR+o='"  // For bundle.js styles
      ],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://*.amazonaws.com'], // For AWS services
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
      // Disable eval completely
      'script-src-attr': ["'none'"],
    },
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 15552000, // 180 days in seconds
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' } // Prevent clickjacking
}));

// Serve static frontend files from the frontend/public directory
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Also serve static files from backend/public for MFA and other backend-specific assets
app.use(express.static(path.join(__dirname, 'public')));

// Root health check endpoint for direct /health requests
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Index route moved to async initialization function after session is configured

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.xhr || req.path.startsWith('/api')) {
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  } else {
    res.status(500).render('error', {
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }
});

// Initialize database and configure session before setting up routes
(async () => {
  try {
    console.log('SERVER.JS: STARTING ASYNC IIFE');
    // Initialize database connection
    console.log('SERVER.JS: About to initialize database');
    await initializeDatabase();
    console.info('Database initialized successfully');
    console.log('SERVER.JS: Database initialized successfully (from server.js)');
    
    // Configure session with Redis store - MUST happen before routes
    console.log('SERVER.JS: About to configure session');
    const sessionConfigured = await configureSession(app, config.session.secret);

    // AdminJS has been removed - using custom admin panel instead
    if (!sessionConfigured) {
      console.error('Failed to configure session, application may not function correctly');
      process.exit(1);
    } else {
      console.info('Session middleware configured successfully');
      console.log('SERVER.JS: Session configured successfully (from server.js)');
    }
    
    // Add session debugging middleware
    app.use((req, res, next) => {
      // Check if session exists and if it contains our key identifiers
      if (!req.session) {
        // Skip warning on health check endpoint
        if (req.path !== '/api/health') {
          console.warn(`Session is undefined in request object for path: ${req.path}`);
        }
      } else {
        // Only log session info for non-health endpoints to reduce noise
        if (req.path !== '/api/health') {
          const sessionId = req.session.id || 'unknown';
          console.debug(`Request to ${req.path} using session ID: ${sessionId}`);
          
          // Add session timestamp to help with session expiration tracking
          req.session.lastAccessed = new Date().toISOString();
        }
      }
      next();
    });
    
    // Passport.js setup - initialize and configure session
    const passport = require('passport');
    const flash = require('connect-flash');
    const db = require('./models');
    const User = db.User;
    
    // Configure Passport
    
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(flash());

    // Debug logging for authentication and MFA status
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path} | Auth: ${req.isAuthenticated ? req.isAuthenticated() : false} | MFA: ${req.session?.mfaVerified || false} | Session ID: ${req.session?.id || 'none'}`);
      
      // Add cookie debug info for troubleshooting
      const cookies = req.headers.cookie || 'none';
      console.log(`Request cookies: ${cookies}`);
      
      next();
    });

    // Global authentication check middleware
    app.use((req, res, next) => {
      // Paths that don't require authentication
      const publicPaths = [
        '/auth/login',
        '/auth/signup',
        '/auth/verify-email',
        '/auth/resend-verification',
        '/auth/forgot-password',
        '/auth/reset-password', // Add reset-password to public paths
        '/static',
        '/favicon.ico',
        '/health',
        '/api', // allow API info endpoints
        '/api/health', // allow API health endpoint
        '/admin-panel',     // custom admin panel
      ];

      // Check if the current path starts with any public path
      const isPublicPath = publicPaths.some(path =>
        req.path === path || req.path.startsWith(`${path}/`)
      );

      if (isPublicPath) {
        return next();
      }

      // Check authentication for non-public paths
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        // If AJAX request, return 401
        if (req.xhr || req.headers.accept === 'application/json') {
          return res.status(401).json({ error: 'Authentication required' });
        }
        // Otherwise redirect to login
        return res.redirect('/auth/login');
      }

      // MFA check - once authenticated, ensure MFA is completed
      // EXCLUDE MFA-related paths from MFA enforcement to prevent redirect loops
      const mfaBypassPaths = ['/auth/send-mfa-code', '/auth/mfa-verify', '/auth/mfa-setup'];
      if (
        req.user &&
        !mfaBypassPaths.includes(req.path) &&
        !req.path.startsWith('/auth/mfa-verify')
      ) {
        if (!req.user.mfaEnabled) {
          console.log('User needs to set up MFA, redirecting to setup');
          return res.redirect('/auth/mfa-setup');
        }
        if (!req.session.mfaVerified) {
          console.log('User needs to verify MFA, redirecting to verification');
          return res.redirect('/auth/mfa-verify');
        }
      }
      next();
    });

    // Passport serialize/deserialize
    passport.serializeUser((user, done) => {
      console.log(`Serializing user ID: ${user.id} with session ID: ${user._sessionID || 'unknown'}`);
      done(null, user.id);
    });
    passport.deserializeUser(async (id, done) => {
      try {
        const user = await User.findByPk(id);
        if (!user) {
          console.log(`User with ID ${id} not found during deserialization`);
          return done(null, false);
        }
        console.log(`Deserialized user ID: ${id}`);
        return done(null, user);
      } catch (err) {
        console.error('Error deserializing user:', err);
        return done(err, null);
      }
    });

    // Make user data available in templates - AFTER session is configured
    app.use((req, res, next) => {
      res.locals.user = req.user || null;
      res.locals.title = 'Bedrock Express AI Chat';
      res.locals.sessionId = req.session ? req.session.id : 'no-session';
      next();
    });
    
    // Add a middleware to preserve conversation history in the session
    app.use((req, res, next) => {
      // Initialize conversations array if it doesn't exist
      if (!req.session.conversations) {
        req.session.conversations = [];
      }
      next();
    });
    
    // Now that session is configured, set up routes
    app.use('/api', apiRoutes);
    
    // Auth Routes - for authentication functionality
    app.use('/auth', authRoutes);

    // Add body-parser middleware (moved from after AdminJS setup)
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    console.log('Body-parser middleware configured');
    
    // Admin Routes - for accessing admin functionality
    app.use('/admin-access', adminRoutes);
    
    // Custom Admin Panel Routes - secure replacement for AdminJS
    app.use('/admin-panel', adminPanelRoutes);
    
    // Chat Routes - specifically for chat functionality
    app.use('/', chatRoutes);
    

    
    // Clear old Redis cache on startup
    await redisClient.clearOldCache();
    
    // Start the server
    const PORT = config.port || 8000;
    const HOST = config.host || 'localhost';

    // Log all registered endpoints for verification
    console.log('🚀 Endpoints:\n', listEndpoints(app));
    
    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

module.exports = app;
