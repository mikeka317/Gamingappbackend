const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { authenticateToken } = require('../middleware/auth');

const db = admin.firestore();

// Save FCM token for push notifications
router.post('/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.uid;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    // Update user document with FCM token
    await db.collection('users').doc(userId).update({
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ FCM token saved for user ${userId}`);

    res.json({
      success: true,
      message: 'FCM token saved successfully'
    });

  } catch (error) {
    console.error('❌ Error saving FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save FCM token',
      error: error.message
    });
  }
});

// Get user's FCM token
router.get('/fcm-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken || null;

    res.json({
      success: true,
      fcmToken: fcmToken
    });

  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get FCM token',
      error: error.message
    });
  }
});

module.exports = router;
