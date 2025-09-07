# 🔥 Firebase Transactions Collection System

## Overview
This system has been updated to use a **separate Firebase collection** for all transactions instead of storing them in user subcollections. This provides better performance, easier querying, and centralized transaction management.

## 🗂️ Collection Structure

### `transactions` Collection
All transactions are now stored in a single `transactions` collection with the following structure:

```javascript
{
  id: "txn_1234567890_abc123",           // Unique transaction ID
  walletId: "user123",                   // Wallet owner ID
  userId: "user123",                      // User ID (same as walletId for user wallets)
  username: "john_doe",                  // Username for display
  type: "deposit",                       // Transaction type
  amount: 100.00,                        // Transaction amount (positive for credits, negative for debits)
  description: "Stripe deposit",         // Human-readable description
  status: "completed",                   // Transaction status
  reference: "challenge_123",            // Reference ID (challenge ID, etc.)
  metadata: {                            // Additional data
    stripeSessionId: "cs_123",
    challengeId: "challenge_123"
  },
  createdAt: Timestamp,                  // Creation timestamp
  updatedAt: Timestamp,                  // Last update timestamp
  migratedAt: Timestamp,                 // Migration timestamp (if migrated)
  originalDocId: "old_doc_id"            // Original document ID (if migrated)
}
```

## 📊 Transaction Types

### Credit Transactions (Positive amounts)
- `deposit` - User deposits (PayPal, Stripe)
- `challenge_reward` - Winnings from challenges
- `refund` - Refunds or reversals

### Debit Transactions (Negative amounts)
- `challenge_deduction` - Challenge entry fees
- `withdrawal` - User withdrawals
- `admin_fee` - Platform fees

## 🔧 Backend Changes

### Wallet Service Updates
- **`addFunds()`** - Now stores in `transactions` collection
- **`deductFunds()`** - Now stores in `transactions` collection  
- **`awardReward()`** - Now stores in `transactions` collection
- **`addAdminFee()`** - Now stores in `transactions` collection

### New Methods
- **`getUserTransactions(userId, limit)`** - Fetches from `transactions` collection
- **`getAllTransactions(limit)`** - Fetches all transactions (admin)
- **`getUserTransactionStats(userId)`** - Calculates user statistics
- **`getTransactionByStripeSession(sessionId)`** - Finds transactions by Stripe session

### API Routes
- **`GET /api/wallet/transactions`** - User transaction history
- **`GET /api/wallet/stats`** - User transaction statistics
- **`GET /api/wallet/all`** - All transactions (admin)

## 🚀 Migration Process

### 1. Run Migration Script
```bash
cd backend
node scripts/migrate-transactions.js
```

### 2. Verify Migration
- Check console output for success/error counts
- Verify transactions appear in new collection
- Test frontend functionality

### 3. Clean Up (Optional)
After successful migration, you can remove old transaction subcollections:
```bash
# This will be done manually in Firebase Console
# Delete: users/{userId}/transactions/{transactionId}
```

## 💡 Benefits

### Performance
- **Faster queries** - No need to query multiple user subcollections
- **Better indexing** - Single collection with optimized indexes
- **Reduced reads** - Query once instead of iterating through users

### Scalability
- **Easier management** - Centralized transaction data
- **Better analytics** - Aggregate data across all users
- **Simpler backups** - Single collection to backup

### Development
- **Cleaner code** - Single source of truth for transactions
- **Easier debugging** - All transactions in one place
- **Better monitoring** - Centralized transaction logging

## 🔍 Query Examples

### Get User Transactions
```javascript
const transactions = await firestore
  .collection('transactions')
  .where('userId', '==', 'user123')
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();
```

### Get Transactions by Type
```javascript
const deposits = await firestore
  .collection('transactions')
  .where('type', '==', 'deposit')
  .where('status', '==', 'completed')
  .get();
```

### Get Recent Transactions
```javascript
const recent = await firestore
  .collection('transactions')
  .orderBy('createdAt', 'desc')
  .limit(100)
  .get();
```

## ⚠️ Important Notes

### Index Requirements
Firebase requires composite indexes for queries with multiple `where` clauses:
- `userId` + `createdAt` (for user transaction history)
- `type` + `status` + `createdAt` (for filtered queries)

### Data Consistency
- All new transactions go to `transactions` collection
- Old transactions remain in user subcollections until migration
- Frontend automatically uses new collection

### Error Handling
- Migration script includes error logging
- Failed migrations are logged but don't stop the process
- Check console output for any issues

## 🎯 Next Steps

1. **Test the new system** with existing functionality
2. **Run migration script** to move old transactions
3. **Verify data integrity** in new collection
4. **Monitor performance** improvements
5. **Clean up old data** after successful migration

## 📞 Support

If you encounter any issues:
1. Check the migration script console output
2. Verify Firebase indexes are created
3. Check backend logs for transaction storage errors
4. Ensure frontend is using updated API endpoints
