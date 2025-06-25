/**
 * Main application routes
 */
const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const chatRoutes = require('./chat');
const apiRoutes = require('./api');
const storyRoutes = require('./story');
const { ensureFullAuth } = require('../middleware/authMiddleware');

// Root route - show story creation form
router.get('/', (req, res) => {
  res.render('create-story', { 
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
});


// Story reader route
router.get('/story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { get } = require('../services/redisService');
    
    // Get story from Redis
    const storyData = await get(`story:${storyId}`);
    
    if (!storyData) {
      return res.status(404).render('error', { 
        message: 'Story not found',
        error: { status: 404 }
      });
    }
    
    const story = JSON.parse(storyData);
    
    // Add image URLs if available
    if (story.sections) {
      const { objectExists, getSignedUrl } = require('../services/s3Service');
      
      for (const section of story.sections) {
        // Check if image exists in S3
        if (section.imageKey && await objectExists(section.imageKey)) {
          // Use CloudFront URL if available, otherwise signed S3 URL
          if (process.env.CLOUDFRONT_DISTRIBUTION_URL) {
            section.imageUrl = `${process.env.CLOUDFRONT_DISTRIBUTION_URL}/${section.imageKey}`;
          } else {
            section.imageUrl = await getSignedUrl(section.imageKey, 3600); // 1 hour expiry
          }
        } else {
          section.imageUrl = null; // Image not yet generated
        }
      }
    }
    
    res.render('story-reader', { 
      story,
      age: req.query.age || 6
    });
    
  } catch (error) {
    console.error('Error loading story:', error);
    res.status(500).render('error', { 
      message: 'Failed to load story',
      error: { status: 500 }
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public pages for logged out users
router.get('/pricing', (req, res) => {
  res.render('pricing');
});

router.get('/terms', (req, res) => {
  res.render('terms');
});

router.get('/privacy', (req, res) => {
  res.render('privacy');
});

router.get('/refund', (req, res) => {
  res.render('refund');
});

router.get('/thank-you', (req, res) => {
  res.render('thank-you');
});

// Mount API routes (no authentication required for basic info endpoints)
router.use('/api', apiRoutes);

// Mount auth routes
router.use('/auth', authRoutes);

// Mount story generation routes (v1 API)
router.use('/v1', storyRoutes);

// Apply full authentication (login + MFA) to all chat routes
router.use('/chat', ensureFullAuth);
router.use('/api/chat', ensureFullAuth);

// Mount chat routes (already have ensureAuthenticated in them)
router.use('/', chatRoutes);

module.exports = router;
