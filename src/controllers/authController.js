const UserService = require('../services/userService');
const { generateToken, generateRefreshToken, verifyToken } = require('../utils/jwt');

class AuthController {
  constructor() {
    this.userService = new UserService();
  }

  // User registration
  async register(req, res) {
    try {
      const userData = req.body;

      // Validate required fields
      if (!userData.email || !userData.username || !userData.password) {
        return res.status(400).json({
          success: false,
          message: 'Email, username, and password are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Validate password strength
      if (userData.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      // Validate username format
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(userData.username)) {
        return res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
        });
      }

      // Validate platforms array
      if (!userData.platforms || userData.platforms.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one gaming platform must be selected'
        });
      }

      // Validate platform structure
      for (const platform of userData.platforms) {
        if (!platform.platform || !platform.onlineUserId || !platform.onlineUserId.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Each platform must have a platform type and online user ID'
          });
        }
      }

      const result = await this.userService.createUser(userData);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (error) {
      console.error('Registration error:', error);
      
      if (error.message.includes('already exists') || error.message.includes('already taken')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Internal server error during registration'
        });
      }
    }
  }

  // User login with email/password or Firebase ID token
  async login(req, res) {
    try {
      const { email, password, idToken } = req.body;

      let userProfile;

      if (idToken) {
        // Firebase authentication flow
        if (!idToken) {
          return res.status(400).json({
            success: false,
            message: 'Firebase ID token is required'
          });
        }

        // Verify Firebase ID token
        const firebaseUser = await this.userService.verifyFirebaseToken(idToken);
        
        // Get user profile from Firestore
        userProfile = await this.userService.getUserByUid(firebaseUser.uid);
        
        if (!userProfile) {
          return res.status(404).json({
            success: false,
            message: 'User profile not found'
          });
        }
      } else if (email && password) {
        // Traditional email/password authentication
        console.log('🔐 Attempting email/password authentication for:', email);
        
        try {
          userProfile = await this.userService.authenticateUser(email, password);
          
          if (!userProfile) {
            console.log('❌ Authentication failed: Invalid credentials');
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials'
            });
          }
          
          console.log('✅ Email/password authentication successful for:', email);
        } catch (authError) {
          console.log('❌ Authentication error:', authError.message);
          return res.status(401).json({
            success: false,
            message: authError.message || 'Invalid credentials'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Either email/password or Firebase ID token is required'
        });
      }

      // Generate JWT tokens (embed admin flag)
      const token = generateToken({
        uid: userProfile.uid,
        email: userProfile.email,
        username: userProfile.username,
        isAdmin: Boolean(userProfile.isAdmin)
      });

      const refreshToken = generateRefreshToken({
        uid: userProfile.uid,
        email: userProfile.email,
        username: userProfile.username,
        isAdmin: Boolean(userProfile.isAdmin)
      });

      // Update user's lastActive timestamp in Firestore
      try {
        const { firestore } = require('../config/firebase');
        if (firestore) {
          await firestore.collection('users').doc(userProfile.uid).update({
            lastActive: Date.now(),
            lastLoginAt: Date.now()
          });
          console.log(`✅ Updated lastActive for user ${userProfile.uid}`);
        }
      } catch (updateError) {
        console.warn('⚠️  Could not update lastActive timestamp:', updateError.message);
        // Don't fail the login if timestamp update fails
      }

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: userProfile,
          token,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.message.includes('Invalid Firebase ID token') || 
          error.message.includes('Invalid credentials') ||
          error.message.includes('User profile not found')) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Internal server error during login'
        });
      }
    }
  }

  // Get current user profile
  async getProfile(req, res) {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const userProfile = await this.userService.getUserByUid(req.user.uid);
      
      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found'
        });
      }

      res.status(200).json({
        success: true,
        data: userProfile
      });
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching profile'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      if (!req.user?.uid) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updates = req.body;
      const allowedUpdates = ['firstName', 'lastName', 'country', 'bio', 'platforms', 'profilePicture', 'username', 'gaming'];
      
      // Validate username if it's being updated
      if (updates.username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(updates.username)) {
          return res.status(400).json({
            success: false,
            message: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
          });
        }
        
        // Check if username is already taken by another user
        const existingUser = await this.userService.getUserByUsername(updates.username);
        if (existingUser && existingUser.uid !== req.user.uid) {
          return res.status(409).json({
            success: false,
            message: 'Username is already taken by another user'
          });
        }
      }
      
      // Filter out non-allowed updates
      const filteredUpdates = {};
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      const updatedProfile = await this.userService.updateUserProfile(req.user.uid, filteredUpdates);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedProfile
      });
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error while updating profile'
      });
    }
  }

  // Refresh JWT token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = verifyToken(refreshToken);

      // Generate new access token
      const newToken = generateToken({
        uid: decoded.uid,
        email: decoded.email,
        username: decoded.username,
        isAdmin: Boolean(decoded.isAdmin)
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newToken
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }
}

module.exports = AuthController;
