const { auth, firestore } = require('../config/firebase');
const bcrypt = require('bcryptjs');

// In-memory storage for development (replace with Firebase later)
const users = new Map();

class UserService {
  constructor() {
    // Initialize with a test user for development
    this.initializeTestUser();
    
    // Log Firebase status
    if (firestore) {
      console.log('🗄️  UserService: Firebase Firestore is available');
      this.usersCollection = firestore.collection('users');
      console.log('📚 Users collection reference created');
    } else {
      console.log('💾 UserService: Using in-memory storage (Firebase not available)');
    }
  }

  async initializeTestUser() {
    const hashedPassword = await bcrypt.hash('password123', 12);
    users.set('test@example.com', {
      uid: 'test-user-1',
      email: 'test@example.com',
      username: 'testuser',
      password: hashedPassword,
      platforms: [{ platform: 'pc', onlineUserId: 'testuser_pc' }],
      firstName: 'Test',
      lastName: 'User',
      country: 'US',
      bio: 'Test user for development',
      profilePicture: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    });
    console.log('👤 Test user initialized in memory');
  }

  // Create a new user with Firebase Authentication
  async createUserWithFirebaseAuth(userData) {
    try {
      const { email, username, password, platforms, firstName, lastName, country, bio } = userData;

      console.log('🆕 Creating new user with Firebase Auth:', { email, username, platforms });

      // Check if username already exists in Firestore
      const existingUsername = await this.getUserByUsername(username);
      if (existingUsername) {
        console.log('❌ User creation failed: Username already taken');
        throw new Error('Username already taken');
      }

      let firebaseUser = null;
      let uid = null;

      if (auth) {
        console.log('🔥 Creating Firebase Auth user...');
        try {
          // Create user in Firebase Auth
          firebaseUser = await auth.createUser({
            email: email,
            password: password,
            displayName: username
          });
          uid = firebaseUser.uid;
          console.log('✅ Firebase Auth user created:', { uid, email });
        } catch (firebaseError) {
          console.error('❌ Firebase Auth creation failed:', firebaseError.message);
          if (firebaseError.code === 'auth/email-already-exists') {
            throw new Error('Email already in use');
          }
          throw new Error('Failed to create Firebase user: ' + firebaseError.message);
        }
      } else {
        // Fallback for development without Firebase Auth
        console.log('⚠️  Firebase Auth not available, using fallback method');
        
        // Check if user already exists in memory/fallback
        const existingUser = await this.getUserByEmail(email);
        if (existingUser) {
          console.log('❌ User creation failed: Email already exists');
          throw new Error('User with this email already exists');
        }

        uid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Create user profile document in Firestore
      const userDoc = {
        uid,
        email,
        username,
        platforms: platforms || [], // Now expects array of {platform, onlineUserId} objects
        firstName: firstName || '',
        lastName: lastName || '',
        country: country || '',
        bio: bio || '',
        profilePicture: '',
        wallet: 0, // Initialize wallet with 0 balance
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        // Store password hash for server-side authentication
        // This allows both Firebase Auth and server-side login
        password: await bcrypt.hash(password, 12)
      };

      if (firestore && this.usersCollection) {
        // Store profile in Firebase Firestore
        console.log('🔥 Storing user profile in Firestore...');
        try {
          await this.usersCollection.doc(uid).set(userDoc);
          console.log('✅ User profile stored successfully in Firestore');
        } catch (firestoreError) {
          console.error('❌ Firestore storage failed:', firestoreError.message);
          
          // If Firestore fails, clean up Firebase Auth user
          if (auth && firebaseUser) {
            try {
              await auth.deleteUser(uid);
              console.log('🧹 Cleaned up Firebase Auth user due to Firestore failure');
            } catch (cleanupError) {
              console.error('❌ Failed to cleanup Firebase Auth user:', cleanupError.message);
            }
          }
          
          console.log('🔄 Falling back to in-memory storage');
          // Add password hash for fallback storage
          const hashedPassword = await bcrypt.hash(password, 12);
          userDoc.password = hashedPassword;
          users.set(email, userDoc);
        }
      } else {
        // Store user in memory with password hash
        console.log('💾 Storing user in memory...');
        const hashedPassword = await bcrypt.hash(password, 12);
        userDoc.password = hashedPassword;
        users.set(email, userDoc);
      }
      
      console.log('✅ User created successfully with Firebase Auth:', { uid, email, username });
      return userDoc;
    } catch (error) {
      console.error('❌ Create user with Firebase Auth error:', error);
      throw error;
    }
  }

  // Legacy create user method (kept for backward compatibility)
  async createUser(userData) {
    console.log('⚠️  Using legacy createUser method, consider using createUserWithFirebaseAuth');
    return this.createUserWithFirebaseAuth(userData);
  }

  // Get user by email
  async getUserByEmail(email) {
    try {
      console.log('�� Looking up user by email:', email);
      
      if (firestore && this.usersCollection) {
        // Try Firebase first
        console.log('🔥 Searching Firebase for user...');
        try {
          const snapshot = await this.usersCollection
            .where('email', '==', email)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const userData = doc.data();
            
            // Ensure user has wallet field
            if (userData.wallet === undefined) {
              console.log('💰 Adding wallet field to existing user:', doc.id);
              await this.usersCollection.doc(doc.id).update({
                wallet: 0,
                updatedAt: new Date().toISOString()
              });
              userData.wallet = 0;
            }
            
            console.log('✅ User found in Firebase:', { uid: userData.uid, username: userData.username, wallet: userData.wallet });
            return {
              uid: doc.id,
              ...userData
            };
          } else {
            console.log('❌ User not found in Firebase');
          }
        } catch (firebaseError) {
          console.error('❌ Firebase lookup failed:', firebaseError.message);
          console.log('🔄 Falling back to memory lookup');
        }
      }

      // Fallback to memory
      const user = users.get(email);
      if (user) {
        console.log('✅ User found in memory:', { uid: user.uid, username: user.username });
        return {
          uid: user.uid,
          ...user
        };
      }

      console.log('❌ User not found in memory');
      return null;
    } catch (error) {
      console.error('❌ Get user by email error:', error);
      throw error;
    }
  }

  // Get user by username
  async getUserByUsername(username) {
    try {
      console.log('🔍 Looking up user by username:', username);
      
      if (firestore && this.usersCollection) {
        // Try Firebase first
        console.log('🔥 Searching Firebase for username...');
        try {
          const snapshot = await this.usersCollection
            .where('username', '==', username)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const userData = doc.data();
            
            // Ensure user has wallet field
            if (userData.wallet === undefined) {
              console.log('💰 Adding wallet field to existing user:', doc.id);
              await this.usersCollection.doc(doc.id).update({
                wallet: 0,
                updatedAt: new Date().toISOString()
              });
              userData.wallet = 0;
            }
            
            console.log('✅ Username found in Firebase:', { uid: userData.uid, email: userData.email, wallet: userData.wallet });
            return {
              uid: doc.id,
              ...userData
            };
          } else {
            console.log('❌ Username not found in Firebase');
          }
        } catch (firebaseError) {
          console.error('❌ Firebase username lookup failed:', firebaseError.message);
          console.log('🔄 Falling back to memory lookup');
        }
      }

      // Fallback to memory
      for (const [email, user] of users.entries()) {
        if (user.username === username) {
          console.log('✅ Username found in memory:', { uid: user.uid, email: user.email });
          return {
            uid: user.uid,
            ...user
          };
        }
      }
      
      console.log('❌ Username not found in memory');
      return null;
    } catch (error) {
      console.error('❌ Get user by username error:', error);
      throw error;
    }
  }

  // Get user by UID
  async getUserByUid(uid) {
    try {
      console.log('🔍 Looking up user by UID:', uid);
      
      if (firestore && this.usersCollection) {
        // Try Firebase first
        console.log('🔥 Searching Firebase for UID...');
        try {
          const doc = await this.usersCollection.doc(uid).get();

          if (doc.exists) {
            const userData = doc.data();
            console.log('✅ User found in Firebase by UID:', { email: userData.email, username: userData.username });
            return {
              uid: doc.id,
              ...userData
            };
          } else {
            console.log('❌ User not found in Firebase by UID');
          }
        } catch (firebaseError) {
          console.error('❌ Firebase UID lookup failed:', firebaseError.message);
          console.log('🔄 Falling back to memory lookup');
        }
      }

      // Fallback to memory
      for (const [email, user] of users.entries()) {
        if (user.uid === uid) {
          console.log('✅ User found in memory by UID:', { email: user.email, username: user.username });
          return {
            uid: user.uid,
            ...user
          };
        }
      }
      
      console.log('❌ User not found in memory by UID');
      return null;
    } catch (error) {
      console.error('❌ Get user by UID error:', error);
      throw error;
    }
  }

  // Get user by any platform username (case-insensitive, fuzzy includes)
  async getUserByPlatformUsername(platformUsername) {
    try {
      const target = (platformUsername || '').toLowerCase().trim();
      if (!target) return null;

      if (firestore && this.usersCollection) {
        // NOTE: Firestore cannot efficiently query array of objects by nested field without an index.
        // For now, fetch a reasonable batch and filter in memory (acceptable for dev/test scale).
        const snapshot = await this.usersCollection.limit(2000).get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const platforms = Array.isArray(data.platforms) ? data.platforms : [];
          const matched = platforms.some(p => {
            const id = (p?.onlineUserId || '').toLowerCase().trim();
            return id && (id === target || id.includes(target) || target.includes(id));
          });
          if (matched) {
            return { uid: doc.id, ...data };
          }
        }
      } else {
        // Fallback: search in-memory users map
        for (const [, data] of users.entries()) {
          const platforms = Array.isArray(data.platforms) ? data.platforms : [];
          const matched = platforms.some(p => {
            const id = (p?.onlineUserId || '').toLowerCase().trim();
            return id && (id === target || id.includes(target) || target.includes(id));
          });
          if (matched) {
            return { uid: data.uid, ...data };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('❌ Get user by platform username error:', error);
      return null;
    }
  }

  // Update user profile
  async updateUserProfile(uid, updates) {
    try {
      console.log('🔄 Updating user profile for UID:', uid);
      console.log('📝 Updates:', updates);
      
      let userToUpdate = null;
      let userEmail = null;

      // First, try to get user from Firestore
      if (firestore && this.usersCollection) {
        console.log('🔥 Looking up user in Firestore...');
        try {
          const firestoreDoc = await this.usersCollection.doc(uid).get();
          if (firestoreDoc.exists) {
            userToUpdate = firestoreDoc.data();
            userEmail = userToUpdate.email;
            console.log('✅ User found in Firestore:', { uid, email: userEmail });
          } else {
            console.log('⚠️  User not found in Firestore, checking memory...');
          }
        } catch (firestoreError) {
          console.error('❌ Firestore lookup failed:', firestoreError.message);
          console.log('🔄 Falling back to memory lookup');
        }
      }

      // If not found in Firestore, check memory
      if (!userToUpdate) {
        console.log('💾 Looking up user in memory...');
        for (const [email, user] of users.entries()) {
          if (user.uid === uid) {
            userToUpdate = user;
            userEmail = email;
            console.log('✅ User found in memory:', { uid, email: userEmail });
            break;
          }
        }
      }

      if (!userToUpdate) {
        console.log('❌ User not found for update in either Firestore or memory');
        throw new Error('User not found');
      }

      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Handle profile image updates
      if (updates.profilePicture) {
        console.log('📸 Profile image update detected:', updates.profilePicture);
        updateData.profilePicture = updates.profilePicture;
      }

      if (firestore && this.usersCollection) {
        // Update in Firebase
        console.log('🔥 Updating user in Firebase...');
        try {
          await this.usersCollection.doc(uid).update(updateData);
          console.log('✅ User updated successfully in Firebase');
        } catch (firebaseError) {
          console.error('❌ Firebase update failed:', firebaseError.message);
          console.log('🔄 Falling back to memory update');
        }
      }

      // Update user in memory if it exists there
      if (userEmail && users.has(userEmail)) {
        console.log('💾 Updating user in memory...');
        const updatedUser = { ...userToUpdate, ...updateData };
        users.set(userEmail, updatedUser);
      }

      // Return updated user data
      const result = await this.getUserByUid(uid);
      console.log('✅ User profile updated successfully');
      return result;
    } catch (error) {
      console.error('❌ Update user profile error:', error);
      throw error;
    }
  }

  // Verify Firebase ID token (placeholder for now)
  async verifyFirebaseToken(idToken) {
    try {
      console.log('🔐 Verifying Firebase ID token...');
      
      if (auth) {
        console.log('🔥 Using Firebase Auth to verify token...');
        try {
          const decodedToken = await auth.verifyIdToken(idToken);
          console.log('✅ Firebase token verified successfully:', { uid: decodedToken.uid, email: decodedToken.email });
          return decodedToken;
        } catch (firebaseError) {
          console.error('❌ Firebase token verification failed:', firebaseError.message);
          throw new Error('Invalid Firebase ID token');
        }
      } else {
        console.log('⚠️  Firebase Auth not available, using mock verification');
        // For development, just return a mock user
        return {
          uid: 'mock-firebase-uid',
          email: 'mock@example.com'
        };
      }
    } catch (error) {
      console.error('❌ Firebase token verification error:', error);
      throw error;
    }
  }

  // Authenticate user with Firebase Auth (for login)
  async authenticateUserWithFirebaseAuth(email, password) {
    try {
      console.log('🔐 Authenticating user with Firebase Auth:', email);
      
      if (auth) {
        console.log('🔥 Using Firebase Auth for authentication...');
        
        // First, try to get user from Firebase Auth
        let firebaseUser = null;
        try {
          firebaseUser = await auth.getUserByEmail(email);
          console.log('✅ Firebase Auth user found:', { uid: firebaseUser.uid, email: firebaseUser.email });
        } catch (authError) {
          if (authError.code === 'auth/user-not-found') {
            console.log('⚠️  User not found in Firebase Auth, checking fallback storage...');
            // User doesn't exist in Firebase Auth, check if they exist in fallback storage
            return await this.authenticateUserFallback(email, password);
          }
          throw authError;
        }

        // User exists in Firebase Auth, get profile from Firestore
        if (firebaseUser) {
          const userProfile = await this.getUserByUid(firebaseUser.uid);
          if (!userProfile) {
            console.log('❌ Authentication failed: User profile not found in Firestore');
            throw new Error('User profile not found');
          }
          
          // Always verify password using stored hash (now all users have passwords stored)
          if (userProfile.password) {
            console.log('🔐 Verifying password with stored hash...');
            const isPasswordValid = await bcrypt.compare(password, userProfile.password);
            if (!isPasswordValid) {
              console.log('❌ Authentication failed: Invalid password');
              throw new Error('Invalid credentials');
            }
          } else {
            console.log('❌ Authentication failed: No password hash found');
            throw new Error('Invalid credentials');
          }
          
          console.log('✅ User authenticated successfully with Firebase Auth:', { uid: userProfile.uid, username: userProfile.username });
          
          // Return user data without password
          const { password: _, ...userWithoutPassword } = userProfile;
          return userWithoutPassword;
        }
      } else {
        console.log('⚠️  Firebase Auth not available, using fallback authentication');
        return await this.authenticateUserFallback(email, password);
      }
    } catch (error) {
      console.error('❌ Firebase Auth authentication error:', error);
      throw error;
    }
  }

  // Fallback authentication method (for development without Firebase Auth)
  async authenticateUserFallback(email, password) {
    try {
      console.log('🔐 Fallback authentication for:', email);
      
      const user = await this.getUserByEmail(email);
      if (!user) {
        console.log('❌ Authentication failed: User not found');
        throw new Error('Invalid credentials');
      }

      if (!user.password) {
        console.log('❌ Authentication failed: No password stored (Firebase Auth user)');
        throw new Error('Please use Firebase Auth for this user');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log('❌ Authentication failed: Invalid password');
        throw new Error('Invalid credentials');
      }

      console.log('✅ User authenticated successfully with fallback:', { uid: user.uid, username: user.username });
      
      // If Firebase Auth is available, migrate this user to Firebase Auth
      if (auth && firestore) {
        try {
          console.log('🔄 Attempting to migrate user to Firebase Auth...');
          await this.migrateUserToFirebaseAuth(user, password);
          console.log('✅ User migrated to Firebase Auth successfully');
        } catch (migrationError) {
          console.log('⚠️  User migration failed, continuing with fallback:', migrationError.message);
        }
      }
      
      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('❌ Fallback authentication error:', error);
      throw error;
    }
  }

  // Migrate existing user to Firebase Auth
  async migrateUserToFirebaseAuth(user, password) {
    try {
      console.log('🔄 Migrating user to Firebase Auth:', { email: user.email, username: user.username });
      
      // Create user in Firebase Auth
      const firebaseUser = await auth.createUser({
        email: user.email,
        password: password,
        displayName: user.username
      });
      
      console.log('✅ Firebase Auth user created:', { uid: firebaseUser.uid });
      
      // Update the user document with the new Firebase UID
      const updatedUser = {
        ...user,
        uid: firebaseUser.uid,
        updatedAt: new Date().toISOString()
      };
      
      // Remove password from the updated user document
      delete updatedUser.password;
      
      // Store updated profile in Firestore
      if (this.usersCollection) {
        await this.usersCollection.doc(firebaseUser.uid).set(updatedUser);
        console.log('✅ User profile updated in Firestore with new UID');
      }
      
      // Remove from in-memory storage
      users.delete(user.email);
      console.log('✅ User removed from in-memory storage');
      
      return firebaseUser;
    } catch (error) {
      console.error('❌ User migration error:', error);
      throw error;
    }
  }

  // Legacy authenticate user method (kept for backward compatibility)
  async authenticateUser(email, password) {
    console.log('⚠️  Using legacy authenticateUser method, consider using authenticateUserWithFirebaseAuth');
    return this.authenticateUserWithFirebaseAuth(email, password);
  }

  // Update profile picture URL
  async updateProfilePicture(uid, imageUrl) {
    try {
      console.log('📸 Updating profile picture for user:', uid);
      console.log('🖼️  New image URL:', imageUrl);

      const updateData = {
        profilePicture: imageUrl,
        updatedAt: new Date().toISOString()
      };

      if (firestore && this.usersCollection) {
        // Update in Firebase
        console.log('🔥 Updating profile picture in Firebase...');
        try {
          await this.usersCollection.doc(uid).update(updateData);
          console.log('✅ Profile picture updated successfully in Firebase');
        } catch (firebaseError) {
          console.error('❌ Firebase update failed:', firebaseError.message);
          throw firebaseError;
        }
      }

      // Update in memory if exists
      for (const [email, user] of users.entries()) {
        if (user.uid === uid) {
          console.log('💾 Updating profile picture in memory...');
          user.profilePicture = imageUrl;
          user.updatedAt = updateData.updatedAt;
          break;
        }
      }

      console.log('✅ Profile picture updated successfully');
      return { profilePicture: imageUrl };
    } catch (error) {
      console.error('❌ Update profile picture error:', error);
      throw error;
    }
  }
}

module.exports = UserService;
