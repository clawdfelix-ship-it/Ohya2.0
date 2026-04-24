// Auth middleware shared across all API modules

module.exports = {
  requireAuth: (req, res, next) => {
    if (req.session && req.session.userId) {
      // Attach user object to req for convenience
      if (req.session.userId) {
        // We can fetch user from DB if needed, but session already has basics
        req.user = {
          id: req.session.userId,
          isAdmin: req.session.isAdmin || false
        };
      }
      return next();
    }
    res.status(401).json({ error: '需要登入' });
  },

  requireAdmin: (req, res, next) => {
    if (req.session && req.session.userId && req.session.isAdmin) {
      req.user = {
        id: req.session.userId,
        isAdmin: true
      };
      return next();
    }
    res.status(401).json({ error: '需要管理員權限' });
  }
};
