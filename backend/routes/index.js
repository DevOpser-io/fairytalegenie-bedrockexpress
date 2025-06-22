/**
 * Main application routes
 */
const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const chatRoutes = require('./chat');
const apiRoutes = require('./api');
const { ensureFullAuth } = require('../middleware/authMiddleware');

// Root route - redirect to chat if fully authenticated (login + MFA), otherwise to login
router.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.session.mfaVerified) {
    return res.redirect('/chat');
  }
  return res.redirect('/auth/login');
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes (no authentication required for basic info endpoints)
router.use('/api', apiRoutes);

// Mount auth routes
router.use('/auth', authRoutes);

// Apply full authentication (login + MFA) to all chat routes
router.use('/chat', ensureFullAuth);
router.use('/api/chat', ensureFullAuth);

// Mount chat routes (already have ensureAuthenticated in them)
router.use('/', chatRoutes);

module.exports = router;
