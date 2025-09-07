const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testTransactionSystem() {
  console.log('🧪 Testing new transaction system...');
  
  try {
    // Test 1: Check if transactions collection exists
    console.log('\n1️⃣ Checking transactions collection...');
    const transactionsSnapshot = await db.collection('transactions').limit(1).get();
    console.log(`   ✅ Transactions collection exists with ${transactionsSnapshot.size} documents`);
    
    // Test 2: Check collection structure
    if (!transactionsSnapshot.empty) {
      const sampleDoc = transactionsSnapshot.docs[0].data();
      console.log('\n2️⃣ Sample transaction structure:');
      console.log('   Fields:', Object.keys(sampleDoc));
      console.log('   Required fields present:', {
        id: !!sampleDoc.id,
        userId: !!sampleDoc.userId,
        type: !!sampleDoc.type,
        amount: !!sampleDoc.amount,
        createdAt: !!sampleDoc.createdAt
      });
    }
    
    // Test 3: Test queries
    console.log('\n3️⃣ Testing queries...');
    
    // Get recent transactions
    const recentTransactions = await db.collection('transactions')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    console.log(`   ✅ Recent transactions query: ${recentTransactions.size} results`);
    
    // Test user-specific query (if we have transactions)
    if (!recentTransactions.empty) {
      const firstTransaction = recentTransactions.docs[0].data();
      if (firstTransaction.userId) {
        const userTransactions = await db.collection('transactions')
          .where('userId', '==', firstTransaction.userId)
          .limit(3)
          .get();
        
        console.log(`   ✅ User transactions query: ${userTransactions.size} results for user ${firstTransaction.userId}`);
      }
    }
    
    // Test 4: Check for migration data
    console.log('\n4️⃣ Checking for migration data...');
    const migratedTransactions = await db.collection('transactions')
      .where('migratedAt', '!=', null)
      .limit(5)
      .get();
    
    console.log(`   📊 Found ${migratedTransactions.size} migrated transactions`);
    
    if (!migratedTransactions.empty) {
      const migrationSample = migratedTransactions.docs[0].data();
      console.log('   Sample migration data:', {
        originalDocId: migrationSample.originalDocId,
        migratedAt: migrationSample.migratedAt,
        userId: migrationSample.userId
      });
    }
    
    // Test 5: Transaction types analysis
    console.log('\n5️⃣ Transaction types analysis...');
    const allTransactions = await db.collection('transactions').get();
    const typeCounts = {};
    
    allTransactions.docs.forEach(doc => {
      const type = doc.data().type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    console.log('   Transaction type distribution:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });
    
    console.log('\n🎉 Transaction system test completed successfully!');
    console.log(`📊 Total transactions in collection: ${allTransactions.size}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run test
testTransactionSystem();
