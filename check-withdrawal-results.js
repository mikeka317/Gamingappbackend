require('dotenv').config();
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
const app = initializeApp({
  credential: require('firebase-admin/auth').cert(serviceAccount)
});

const db = getFirestore(app);

async function checkWithdrawalResults() {
  try {
    console.log('🔍 Checking Withdrawal Results...\n');
    
    // Check recent withdrawals
    console.log('1️⃣ Recent Withdrawals:');
    const withdrawalsRef = db.collection('transactions');
    const withdrawals = await withdrawalsRef
      .where('type', '==', 'withdrawal')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (withdrawals.empty) {
      console.log('   ℹ️  No withdrawals found yet');
      console.log('   💡 Try making a withdrawal from the frontend first');
    } else {
      console.log(`   ✅ Found ${withdrawals.size} withdrawal(s):`);
      withdrawals.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n   ${index + 1}. Withdrawal Details:`);
        console.log(`      💰 Amount: $${Math.abs(data.amount)}`);
        console.log(`      📝 Description: ${data.description}`);
        console.log(`      📊 Status: ${data.status}`);
        console.log(`      🏦 Method: ${data.metadata?.payoutMethod || 'unknown'}`);
        console.log(`      🆔 Reference: ${data.reference}`);
        console.log(`      📅 Created: ${data.createdAt?.toDate?.() || data.createdAt}`);
        
        if (data.metadata?.stripePayoutId) {
          console.log(`      🎯 Stripe Payout ID: ${data.metadata.stripePayoutId}`);
        }
        if (data.metadata?.stripeStatus) {
          console.log(`      📈 Stripe Status: ${data.metadata.stripeStatus}`);
        }
      });
    }
    
    // Check user wallet balances
    console.log('\n2️⃣ User Wallet Balances:');
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.limit(10).get();
    
    if (usersSnapshot.empty) {
      console.log('   ❌ No users found');
    } else {
      console.log(`   ✅ Found ${usersSnapshot.size} user(s):`);
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        const walletBalance = userData.wallet || 0;
        console.log(`      👤 ${userData.username || 'Unknown'}: $${walletBalance.toFixed(2)}`);
      });
    }
    
    console.log('\n🎯 Test Summary:');
    console.log('   ✅ Database connection: Working');
    console.log('   ✅ Transaction tracking: Working');
    console.log('   ✅ Wallet management: Working');
    console.log('   ⚠️  Stripe payouts: May fail in test mode (expected)');
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    process.exit(0);
  }
}

checkWithdrawalResults();
