const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin using environment variables
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    console.log('🔐 Initializing Firebase with environment variables...');
    
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
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });
  } else {
    console.error('❌ Firebase environment variables not found. Please check your .env file.');
    process.exit(1);
  }
}

const db = admin.firestore();

const defaultTournamentTypes = [
  {
    name: 'Clash',
    key: 'clash',
    players: 4,
    entryFee: 10,
    winnerReward: 0.9,
    adminReward: 0.1,
    description: 'Quick 4-player battles for fast-paced action',
    icon: '⚔️',
    color: 'bg-red-500',
    displayOrder: 1,
    isActive: true
  },
  {
    name: 'Battle',
    key: 'battle',
    players: 8,
    entryFee: 20,
    winnerReward: 0.8,
    adminReward: 0.2,
    description: 'Epic 8-player wars with higher stakes',
    icon: '🔥',
    color: 'bg-orange-500',
    displayOrder: 2,
    isActive: true
  },
  {
    name: 'Rumble',
    key: 'rumble',
    players: 16,
    entryFee: 50,
    winnerReward: 0.8,
    adminReward: 0.2,
    description: 'Massive 16-player clashes for the brave',
    icon: '💥',
    color: 'bg-yellow-500',
    displayOrder: 3,
    isActive: true
  },
  {
    name: 'Warzone',
    key: 'warzone',
    players: 32,
    entryFee: 100,
    winnerReward: 0.8,
    adminReward: 0.2,
    description: 'Ultimate 32-player battles for champions',
    icon: '🌪️',
    color: 'bg-purple-500',
    displayOrder: 4,
    isActive: true
  }
];

async function seedTournamentTypes() {
  try {
    console.log('🌱 Seeding tournament types...');

    for (const tournamentType of defaultTournamentTypes) {
      // Check if tournament type already exists
      const existingType = await db.collection('tournamentTypes')
        .where('key', '==', tournamentType.key)
        .get();

      if (!existingType.empty) {
        console.log(`⚠️  Tournament type '${tournamentType.name}' already exists, skipping...`);
        continue;
      }

      // Add creation timestamp
      const tournamentTypeData = {
        ...tournamentType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system'
      };

      // Create tournament type
      const docRef = await db.collection('tournamentTypes').add(tournamentTypeData);
      console.log(`✅ Created tournament type: ${tournamentType.name} (${docRef.id})`);
    }

    console.log('🎉 Tournament types seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding tournament types:', error);
    process.exit(1);
  }
}

seedTournamentTypes();
