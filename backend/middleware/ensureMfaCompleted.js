/**
 * Middleware to ensure MFA is set up and verified
 */
module.exports = function ensureMfaCompleted(req, res, next) {
  // User must be authenticated first
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect('/auth/login');
  }
  
  // Check if MFA is enabled but not verified for this session
  if (req.user.mfaEnabled && !req.session.mfaVerified) {
    // Store the original URL for redirection after MFA verification
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/mfa-verify');
  }
  
  // Check if MFA setup is required (first login)
  if (!req.user.mfaEnabled) {
    // Store the original URL for redirection after MFA setup
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/mfa-setup');
  }
  
  // User is authenticated and MFA is verified
  return next();
};
