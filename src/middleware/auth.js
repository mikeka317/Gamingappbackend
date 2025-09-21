const { verifyToken } = require('../utils/jwt');
const admin = require('firebase-admin');

// Get Firestore instance
const db = admin.firestore();

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    try {
      // First try Firebase Auth token verification
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('✅ Firebase Auth token verified:', {
          uid: decodedToken.uid,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified
        });
        
        // Get user's actual username from Firestore
        let actualUsername = decodedToken.email?.split('@')[0] || decodedToken.name;
        try {
          const userDoc = await db.collection('users').doc(decodedToken.uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            actualUsername = userData.username || userData.displayName || actualUsername;
          }
        } catch (dbError) {
          console.log('⚠️ Could not fetch user data from Firestore:', dbError.message);
        }

        // Convert Firebase user to our user format
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          username: actualUsername,
          email_verified: decodedToken.email_verified,
          // Check if this is an admin user
          isAdmin: decodedToken.email?.toLowerCase() === 'admin@gc.com' || 
                   decodedToken.email?.split('@')[0]?.toLowerCase() === 'admin',
          role: decodedToken.email?.toLowerCase() === 'admin@gc.com' ? 'admin' : 'user'
        };
        
        next();
        return;
      } catch (firebaseError) {
        console.log('⚠️ Firebase Auth verification failed, trying JWT:', firebaseError.message);
        
        // Fallback to JWT verification for backward compatibility
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
        return;
      }
    } catch (error) {
      console.error('❌ Token verification failed:', error.message);
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

const requireAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is admin using multiple conditions (matching frontend logic)
    const isAdmin = Boolean(req.user.isAdmin) || 
                   req.user.username?.toLowerCase() === 'admin' || 
                   req.user.role === 'admin' ||
                   req.user.email?.toLowerCase() === 'admin@gc.com' ||
                   req.user.email?.split('@')[0]?.toLowerCase() === 'admin';

    if (!isAdmin) {
      console.log('❌ Admin access denied for user:', {
        uid: req.user.uid,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        isAdmin: req.user.isAdmin,
        email_verified: req.user.email_verified
      });
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    console.log('✅ Admin access granted for user:', req.user.username || req.user.email);
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin verification'
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin
};
