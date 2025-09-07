const express = require('express');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const authController = new AuthController();

// Debug middleware for all routes
router.use((req, res, next) => {
  console.log(`🔐 Auth Route: ${req.method} ${req.path}`);
  console.log(`🔐 Headers:`, req.headers);
  next();
});

// Public routes
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    const { auth } = require('../config/firebase');
    if (!auth) {
      return res.status(503).json({ success: false, message: 'Password reset unavailable (Auth not configured)' });
    }

    // Optional: customize continue URL
    const actionCodeSettings = {
      // Return to login after reset completes
      url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/login` : 'http://localhost:8080/login',
      handleCodeInApp: false
    };

    const resetLink = await auth.generatePasswordResetLink(email, actionCodeSettings);

    // Try sending via email using nodemailer if SMTP env is configured
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: parseInt(SMTP_PORT, 10),
          secure: parseInt(SMTP_PORT, 10) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
        await transporter.sendMail({
          from: SMTP_FROM,
          to: email,
          subject: 'Reset your password',
          html: `<p>You requested a password reset.</p><p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`
        });
        return res.json({ success: true, message: 'Password reset email sent' });
      } catch (mailErr) {
        console.warn('⚠️ Failed to send reset email via SMTP, returning link instead:', mailErr?.message);
        return res.json({ success: true, message: 'Password reset link generated', data: { resetLink } });
      }
    }

    // If no SMTP configured, return link so frontend can instruct user
    return res.json({ success: true, message: 'Password reset link generated', data: { resetLink } });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    const message = error?.message || 'Failed to initiate password reset';
    return res.status(500).json({ success: false, message });
  }
});

// Logout endpoint to track user going offline
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Update user's lastActive timestamp when they logout
    const { firestore } = require('../config/firebase');
    if (firestore) {
      await firestore.collection('users').doc(req.user.uid).update({
        lastActive: Date.now() - 60000 // Set to 1 minute ago (offline)
      });
      console.log(`✅ Updated lastActive for logout user ${req.user.uid}`);
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
});

// Protected routes
router.get('/profile', authenticateToken, authController.getProfile.bind(authController));
router.put('/profile', authenticateToken, authController.updateProfile.bind(authController));

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({
    success: true,
    message: 'Auth route is working',
    timestamp: new Date().toISOString()
  });
});

// New route to get all users (temporarily public for testing)
router.get('/users', async (req, res) => {
  try {
    console.log('🔍 Backend: Starting users fetch...');
    
    const { firestore } = require('../config/firebase');
    console.log('🔍 Backend: Firebase firestore loaded');
    
    if (!firestore) {
      console.log('⚠️ Firestore not available, returning mock data');
      // Return mock data for testing when Firestore is not available
      const mockUsers = [
        {
          uid: '1',
          firstName: 'John',
          lastName: 'Doe',
          username: 'CyberWarrior',
          email: 'john@example.com',
          profilePicture: '',
          rank: 'diamond',
          winRate: 87.5,
          totalGames: 156,
          currentStreak: 12,
          favoriteGame: 'Valorant',
          createdAt: Date.now(),
          lastActive: Date.now() - 120000
        },
        {
          uid: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          username: 'PixelHunter',
          email: 'jane@example.com',
          profilePicture: '',
          rank: 'platinum',
          winRate: 72.3,
          totalGames: 89,
          currentStreak: 5,
          favoriteGame: 'CS:GO',
          createdAt: Date.now(),
          lastActive: Date.now() - 300000
        }
      ];
      
      return res.json({
        success: true,
        users: mockUsers,
        message: 'Mock data (Firestore not available)'
      });
    }
    
    console.log('🔍 Backend: Fetching users from Firestore...');
    
    const usersRef = firestore.collection('users');
    console.log('🔍 Backend: Collection reference created');
    
    const snapshot = await usersRef.get();
    console.log('🔍 Backend: Snapshot received, processing...');
    
    const users = [];
    snapshot.forEach((doc) => {
      const userData = doc.data();
      
      // Calculate proper lastActive time
      let lastActiveTime;
      if (userData.lastActive) {
        // Convert to timestamp if it's a string, or use as-is if it's a number
        if (typeof userData.lastActive === 'string') {
          lastActiveTime = new Date(userData.lastActive).getTime();
          console.log(`🔍 User ${userData.username}: lastActive string "${userData.lastActive}" converted to timestamp ${lastActiveTime}`);
        } else {
          lastActiveTime = userData.lastActive;
          console.log(`🔍 User ${userData.username}: lastActive number ${userData.lastActive}`);
        }
      } else if (userData.lastLoginAt) {
        // Fallback to lastLoginAt if lastActive doesn't exist
        if (typeof userData.lastLoginAt === 'string') {
          lastActiveTime = new Date(userData.lastLoginAt).getTime();
          console.log(`🔍 User ${userData.username}: using lastLoginAt string "${userData.lastLoginAt}" converted to ${lastActiveTime}`);
        } else {
          lastActiveTime = userData.lastLoginAt;
          console.log(`🔍 User ${userData.username}: using lastLoginAt number ${userData.lastLoginAt}`);
        }
      } else if (userData.createdAt) {
        // Fallback to creation time if no login data exists
        if (typeof userData.createdAt === 'string') {
          lastActiveTime = new Date(userData.createdAt).getTime();
          console.log(`🔍 User ${userData.username}: using createdAt string "${userData.createdAt}" converted to ${lastActiveTime}`);
        } else {
          lastActiveTime = userData.createdAt;
          console.log(`🔍 User ${userData.username}: using createdAt number ${userData.createdAt}`);
        }
      } else {
        // If no timestamp exists, set to 24 hours ago (offline)
        lastActiveTime = Date.now() - (24 * 60 * 60 * 1000);
        console.log(`🔍 User ${userData.username}: no timestamp found, setting to 24 hours ago: ${lastActiveTime}`);
      }
      
      // Ensure lastActiveTime is a valid number
      if (isNaN(lastActiveTime)) {
        console.warn(`⚠️ Invalid lastActive for user ${doc.id}, setting to 24 hours ago`);
        lastActiveTime = Date.now() - (24 * 60 * 60 * 1000);
      }
      
      console.log(`✅ User ${userData.username}: final lastActive timestamp: ${lastActiveTime} (${new Date(lastActiveTime).toLocaleString()})`);
      
      users.push({
        uid: doc.id,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        username: userData.username || '',
        email: userData.email || '',
        profilePicture: userData.profilePicture || '',
        rank: userData.rank || 'bronze',
        winRate: userData.winRate || 0,
        totalGames: userData.totalGames || 0,
        currentStreak: userData.currentStreak || 0,
        favoriteGame: userData.favoriteGame || 'Unknown',
        createdAt: userData.createdAt || Date.now(),
        lastActive: lastActiveTime,
        isAdmin: Boolean(userData.isAdmin)
      });
    });
    
    // Sort by last active (most recent first)
    users.sort((a, b) => b.lastActive - a.lastActive);
    
    console.log(`✅ Backend: Fetched ${users.length} users from Firestore`);
    console.log('✅ Backend: Sample user data:', users[0] || 'No users found');
    
    res.json({
      success: true,
      users: users
    });
    
  } catch (error) {
    console.error('❌ Backend: Error fetching users:', error);
    console.error('❌ Backend: Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;
