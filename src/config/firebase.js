const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Firebase Admin SDK (optional for development)
let firebaseApp = null;
let auth = null;
let firestore = null;
let storage = null;

// console.log('🔥 Firebase Configuration Starting...');
// console.log('📁 Environment variables loaded:', {
//   FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Not set',
//   FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? '✅ Set' : '❌ Not set',
//   FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Not set',
//   FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL ? '✅ Set' : '❌ Not set',
//   FIREBASE_STORAGE_BUCKET: `${process.env.FIREBASE_PROJECT_ID || 'N/A'}.firebasestorage.app`
// });

try {
  // Check if Firebase is already initialized
  if (admin.apps.length === 0) {
    // Use individual Firebase environment variables if available
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      console.log('🔐 Initializing Firebase with individual environment variables...');
      
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
      };
      
      // console.log('📋 Service Account Details:', {
      //   projectId: serviceAccount.project_id,
      //   clientEmail: serviceAccount.client_email,
      //   privateKeyId: serviceAccount.private_key_id
      // });
      
      // Use explicit bucket if provided (respect exact value), otherwise default to <project-id>.appspot.com
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
        storageBucket: storageBucket
      });
      
      // console.log('🪣 Storage Bucket configured:', storageBucket);
      
      // console.log('✅ Firebase Admin SDK initialized successfully!');
      // console.log('🌐 Database URL:', process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`);
      
      // Export Firebase services
      auth = firebaseApp.auth();
      firestore = firebaseApp.firestore();
      storage = firebaseApp.storage();
      
      // console.log('🔑 Firebase Auth service ready');
      // console.log('🗄️  Firestore service ready');
      // console.log('📁 Firebase Storage service ready');
      
      // Test Firebase connection
      // console.log('🧪 Testing Firebase connection...');
      // firestore.collection('test').doc('connection-test').get()
      //   .then(() => {
      //     console.log('✅ Firestore connection test successful!');
      //   })
      //   .catch((error) => {
      //     console.log('❌ Firestore connection test failed:', error.message);
      //   });
        
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Fallback to the old method if FIREBASE_SERVICE_ACCOUNT_KEY is set
      // console.log('🔐 Initializing Firebase with Service Account Key...');
      
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      // console.log('📋 Service Account Details:', {
      //   projectId: serviceAccount.project_id,
      //   clientEmail: serviceAccount.client_email,
      //   privateKeyId: serviceAccount.private_key_id
      // });
      
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`;
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: storageBucket
      });
      
      // console.log('🪣 Storage Bucket configured:', storageBucket);
      
      // console.log('✅ Firebase Admin SDK initialized successfully!');
      // console.log('🌐 Database URL:', process.env.FIREBASE_DATABASE_URL);
      
      // Export Firebase services
      auth = firebaseApp.auth();
      firestore = firebaseApp.firestore();
      storage = firebaseApp.storage();
      
      // console.log('🔑 Firebase Auth service ready');
      // console.log('🗄️  Firestore service ready');
      // console.log('📁 Firebase Storage service ready');
      
      // Test Firebase connection
      // console.log('🧪 Testing Firebase connection...');
      firestore.collection('test').doc('connection-test').get()
        .then(() => {
          console.log('✅ Firestore connection test successful!');
        })
        .catch((error) => {
          console.log('❌ Firestore connection test failed:', error.message);
        });
        
    } else {
      console.log('⚠️  Firebase not configured - running in development mode without Firebase');
      console.log('💡 To enable Firebase, set Firebase environment variables in your .env file');
    }
  } else {
    console.log('🔄 Firebase already initialized, using existing instance');
    firebaseApp = admin.app();
    auth = firebaseApp.auth();
    firestore = firebaseApp.firestore();
    storage = firebaseApp.storage();
    
    console.log('🪣 Storage Bucket from existing instance:', firebaseApp.options.storageBucket || 'Not configured');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  console.log('🔄 Continuing without Firebase - running in development mode');
}

// Log final status
// console.log('📊 Firebase Status Summary:', {
//   firebaseApp: firebaseApp ? '✅ Initialized' : '❌ Not initialized',
//   auth: auth ? '✅ Ready' : '❌ Not available',
//   firestore: firestore ? '✅ Ready' : '❌ Not available',
//   storage: storage ? '✅ Ready' : '❌ Not available'
// });

module.exports = {
  auth,
  firestore,
  firebaseApp,
  storage
};
