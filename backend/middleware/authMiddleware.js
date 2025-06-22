/**
 * Complete authentication middleware that checks both login and MFA status
 */

module.exports = {
  // Basic authentication check
  ensureAuthenticated: function(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    // Store original URL for redirect after login
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  },

  // MFA verification check
  ensureMfaVerified: function(req, res, next) {
    // Must be authenticated first
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/login');
    }
    // If MFA not set up, redirect to setup
    if (!req.user.mfaEnabled) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/mfa-setup');
    }
    // If MFA not verified in this session, redirect to verification
    if (!req.session.mfaVerified) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/mfa-verify');
    }
    // All checks passed
    return next();
  },

  // Combined middleware for routes that need both
  ensureFullAuth: function(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/login');
    }
    if (!req.user.mfaEnabled) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/mfa-setup');
    }
    if (!req.session.mfaVerified) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/mfa-verify');
    }
    return next();
  }
};
