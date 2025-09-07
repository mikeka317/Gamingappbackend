const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateTransactions() {
  console.log('🚀 Starting transaction migration...');
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    console.log(`📊 Found ${usersSnapshot.size} users to process`);
    
    let totalTransactions = 0;
    let migratedTransactions = 0;
    let errors = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      console.log(`\n👤 Processing user: ${userData.username || userId}`);
      
      try {
        // Get user's transactions subcollection
        const transactionsSnapshot = await userDoc.ref.collection('transactions').get();
        
        if (transactionsSnapshot.empty) {
          console.log(`   ⚠️  No transactions found for user ${userId}`);
          continue;
        }
        
        console.log(`   📝 Found ${transactionsSnapshot.size} transactions`);
        totalTransactions += transactionsSnapshot.size;
        
        // Migrate each transaction
        for (const transactionDoc of transactionsSnapshot.docs) {
          const transactionData = transactionDoc.data();
          
          try {
            // Add userId and username if not present
            const migrationData = {
              ...transactionData,
              userId: userId,
              username: userData.username || 'Unknown',
              migratedAt: new Date(),
              originalDocId: transactionDoc.id
            };
            
            // Store in new transactions collection
            await db.collection('transactions').add(migrationData);
            migratedTransactions++;
            
            console.log(`   ✅ Migrated transaction: ${transactionData.type} - $${transactionData.amount}`);
            
          } catch (error) {
            console.error(`   ❌ Failed to migrate transaction ${transactionDoc.id}:`, error.message);
            errors++;
          }
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing user ${userId}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total transactions found: ${totalTransactions}`);
    console.log(`   Successfully migrated: ${migratedTransactions}`);
    console.log(`   Errors: ${errors}`);
    
    if (errors === 0) {
      console.log('\n✨ All transactions migrated successfully!');
      console.log('💡 You can now safely remove the old transaction subcollections.');
    } else {
      console.log('\n⚠️  Some transactions failed to migrate. Check the logs above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run migration
migrateTransactions();
