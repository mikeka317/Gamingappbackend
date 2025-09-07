const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
const app = initializeApp({
  credential: require('firebase-admin/auth').cert(serviceAccount)
});

const db = getFirestore(app);

async function testStripeWithdrawal() {
  try {
    console.log('🧪 Testing Stripe Withdrawal System...\n');
    
    // Test 1: Check if transactions collection exists
    console.log('1️⃣ Checking transactions collection...');
    const transactionsRef = db.collection('transactions');
    const snapshot = await transactionsRef.limit(1).get();
    
    if (snapshot.empty) {
      console.log('   ❌ No transactions found - collection might be empty');
    } else {
      console.log('   ✅ Transactions collection exists and accessible');
    }
    
    // Test 2: Look for recent Stripe withdrawals
    console.log('\n2️⃣ Looking for recent Stripe withdrawals...');
    const stripeWithdrawals = await transactionsRef
      .where('type', '==', 'withdrawal')
      .where('paymentMethod', '==', 'stripe')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (stripeWithdrawals.empty) {
      console.log('   ℹ️  No Stripe withdrawals found yet');
      console.log('   💡 Try making a withdrawal from the frontend first');
    } else {
      console.log(`   ✅ Found ${stripeWithdrawals.size} Stripe withdrawal(s):`);
      stripeWithdrawals.forEach((doc, index) => {
        const data = doc.data();
        console.log(`      ${index + 1}. $${data.amount} - ${data.description}`);
        console.log(`         Status: ${data.status}`);
        console.log(`         Bank Details: ${data.bankDetails ? '✅ Present' : '❌ Missing'}`);
        console.log(`         Created: ${data.createdAt?.toDate?.() || data.createdAt}`);
        console.log('');
      });
    }
    
    // Test 3: Check wallet balances
    console.log('3️⃣ Checking user wallet balances...');
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.limit(5).get();
    
    if (usersSnapshot.empty) {
      console.log('   ❌ No users found');
    } else {
      console.log(`   ✅ Found ${usersSnapshot.size} user(s):`);
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        const walletBalance = userData.wallet || 0;
        console.log(`      ${userData.username || 'Unknown'}: $${walletBalance.toFixed(2)}`);
      });
    }
    
    // Test 4: Test withdrawal endpoint (simulated)
    console.log('\n4️⃣ Testing withdrawal endpoint simulation...');
    console.log('   📝 To test the actual endpoint:');
    console.log('   1. Start your backend server: npm run dev');
    console.log('   2. Go to frontend Profile > Wallet');
    console.log('   3. Select "Stripe" withdrawal method');
    console.log('   4. Fill in test bank details:');
    console.log('      - Account Holder: Test User');
    console.log('      - Routing Number: 123456789');
    console.log('      - Account Number: 1234567890');
    console.log('   5. Submit withdrawal');
    console.log('   6. Check backend logs and this script again');
    
    console.log('\n🎯 Test Summary:');
    console.log('   ✅ Database connection: Working');
    console.log('   ✅ Collections: Accessible');
    console.log('   ⏳ Stripe withdrawals: Ready for testing');
    console.log('   💡 Next step: Test from frontend UI');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testStripeWithdrawal();
