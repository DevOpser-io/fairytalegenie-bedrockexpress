// Middleware to ensure a user is authenticated
module.exports = function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  // Optionally, store the original URL for redirect after login
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
};
