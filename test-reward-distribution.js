const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, addDoc } = require('firebase/firestore');

// Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

async function testRewardDistribution() {
  try {
    console.log('🧪 Testing reward distribution...');
    
    // Test the wallet service
    const WalletService = require('./src/services/walletService');
    const walletService = new WalletService();
    
    // Test user ID (replace with actual user ID)
    const testUserId = 'cZtr7uO6eaNhFWWrznm8LNyKRr63'; // From the logs
    const testChallengeId = 'test-challenge-123';
    const testAmount = 19; // 95% of $20 (2 x $10 stake)
    
    console.log('💰 Testing wallet service...');
    console.log('User ID:', testUserId);
    console.log('Amount:', testAmount);
    
    // Test awarding reward
    await walletService.awardReward(testUserId, testAmount, testChallengeId, 'Test reward distribution');
    
    console.log('✅ Reward distribution test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing reward distribution:', error);
  }
}

// Run the test
testRewardDistribution();
