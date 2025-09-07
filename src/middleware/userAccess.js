/**
 * Middleware to ensure users can only access their own data
 * This provides an additional security layer beyond authentication
 */

const ensureOwnData = (req, res, next) => {
  try {
    // This middleware should be used after authenticateToken
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // For routes that might have userId in params or body
    const requestedUserId = req.params.userId || req.body.userId;
    
    if (requestedUserId && requestedUserId !== req.user.uid) {
      console.log('🚨 Security Alert: User attempted to access another user\'s data:', {
        authenticatedUser: req.user.uid,
        requestedUser: requestedUserId,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own data.'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Error in userAccess middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to ensure admin access
 */
const ensureAdmin = (req, res, next) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.user.isAdmin) {
      console.log('🚨 Security Alert: Non-admin user attempted to access admin route:', {
        userId: req.user.uid,
        username: req.user.username,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Error in admin middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to log all wallet access attempts for security monitoring
 */
const logWalletAccess = (req, res, next) => {
  try {
    if (req.user && req.user.uid) {
      console.log('🔐 Wallet access attempt:', {
        userId: req.user.uid,
        username: req.user.username,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
    }
    next();
  } catch (error) {
    // Don't block the request if logging fails
    console.error('❌ Error in wallet access logging:', error);
    next();
  }
};

module.exports = {
  ensureOwnData,
  ensureAdmin,
  logWalletAccess
};
