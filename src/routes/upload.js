const express = require('express');
const multer = require('multer');
const { storage } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const UserService = require('../services/userService');
const router = express.Router();

// Test storage service endpoint
router.get('/test-storage', authenticateToken, async (req, res) => {
  try {
    console.log('🧪 Testing storage service endpoint...');
    
    if (!storage) {
      return res.status(500).json({
        success: false,
        message: 'Storage service not available'
      });
    }
    
    // Test getting bucket
    const bucket = storage.bucket();
    console.log('✅ Bucket retrieved:', bucket.name);
    
    res.json({
      success: true,
      message: 'Storage service is working',
      data: {
        bucketName: bucket.name,
        storageAvailable: true
      }
    });
    
  } catch (error) {
    console.error('❌ Storage test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Storage service test failed',
      error: error.message
    });
  }
});

// Configure multer for memory storage (we'll upload directly to Firebase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Upload profile image
router.post('/profile-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { uid } = req.user;
    const file = req.file;
    
    console.log('📸 Uploading profile image for user:', uid);
    console.log('📁 File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    if (!storage) {
      console.log('❌ Firebase Storage not available');
      return res.status(500).json({
        success: false,
        message: 'File storage service not available'
      });
    }

    console.log('🔍 Storage service details:', {
      storage: storage ? 'Available' : 'Not available',
      storageType: storage ? typeof storage : 'N/A',
      hasBucket: storage && typeof storage.bucket === 'function' ? 'Yes' : 'No',
      storageOptions: storage ? Object.keys(storage) : 'N/A'
    });
    
    // Test storage initialization
    try {
      console.log('🧪 Testing storage service...');
      const testBucket = storage.bucket();
      console.log('✅ Storage bucket test successful:', testBucket.name);
    } catch (storageError) {
      console.error('❌ Storage bucket test failed:', storageError.message);
      console.error('❌ Storage error details:', storageError);
    }

    // Create a unique filename
    const timestamp = Date.now();
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `profile-images/${uid}/${timestamp}.${fileExtension}`;
    
    console.log('📝 Generated filename:', fileName);

    // Get the default bucket
    console.log('🪣 Attempting to get storage bucket...');
    const bucket = storage.bucket();
    console.log('✅ Bucket retrieved:', bucket.name);
    
    // Create a file reference
    const fileRef = bucket.file(fileName);
    
    // Upload the file (add cache headers for faster CDN/edge delivery)
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'public, max-age=31536000',
        metadata: {
          uploadedBy: uid,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      }
    });

    console.log('✅ File uploaded successfully to Firebase Storage');

    // Prefer signed URLs (works even if bucket isn’t publicly readable)
    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365 // ~1 year
    });
    const publicUrl = signedUrl;
    console.log('🔗 Signed URL generated:', publicUrl);

    // Update user's profile picture in the database (fire-and-forget; don't block response)
    try {
      const userService = new UserService();
      userService
        .updateProfilePicture(uid, publicUrl)
        .then(() => console.log('✅ User profile picture updated in database'))
        .catch((updateError) => console.error('⚠️  Failed to update user profile picture in database:', updateError.message));
    } catch (_) {
      // Swallow errors from scheduling the async update
    }

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: publicUrl,
        fileName: fileName,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      }
    });

  } catch (error) {
    console.error('❌ Profile image upload error:', error);
    
    if (error.message === 'Only image files are allowed') {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error.message
    });
  }
});

// Delete profile image
router.delete('/profile-image', authenticateToken, async (req, res) => {
  try {
    const { uid } = req.user;
    
    console.log('🗑️  Deleting profile image for user:', uid);

    if (!storage) {
      console.log('❌ Firebase Storage not available');
      return res.status(500).json({
        success: false,
        message: 'File storage service not available'
      });
    }

    // Get the default bucket
    const bucket = storage.bucket();
    
    // List all files in the user's profile-images folder
    const [files] = await bucket.getFiles({
      prefix: `profile-images/${uid}/`
    });

    if (files.length === 0) {
      console.log('⚠️  No profile images found for user');
      return res.status(404).json({
        success: false,
        message: 'No profile images found'
      });
    }

    // Delete all profile images for the user
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);

    console.log('✅ Deleted profile images:', files.length);

    res.status(200).json({
      success: true,
      message: 'Profile images deleted successfully',
      data: {
        deletedCount: files.length
      }
    });

  } catch (error) {
    console.error('❌ Profile image deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile images',
      error: error.message
    });
  }
});

module.exports = router;
