const admin = require('firebase-admin');

class BusinessWalletService {
  constructor() {
    this.firestore = admin.firestore();
  }

  // Track business wallet transaction
  async recordBusinessTransaction(type, amount, currency, description, metadata = {}) {
    try {
      const transaction = {
        type, // 'deposit', 'withdrawal', 'refund', etc.
        amount: parseFloat(amount),
        currency: currency || 'USD',
        description,
        metadata: {
          ...metadata,
          timestamp: new Date(),
          processedAt: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store in business_transactions collection
      const transactionRef = await this.firestore.collection('business_transactions').add(transaction);
      
      console.log('💼 Business wallet transaction recorded:', {
        transactionId: transactionRef.id,
        type,
        amount,
        currency,
        description
      });

      return {
        success: true,
        transactionId: transactionRef.id,
        transaction
      };
    } catch (error) {
      console.error('❌ Error recording business transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get business wallet balance (computed from transactions)
  async getBusinessBalance(currency = 'CAD') {
    try {
      const transactionsRef = this.firestore.collection('business_transactions');
      // Get all transactions first, then filter in memory to avoid index requirement
      const snapshot = await transactionsRef.get();

      let balance = 0;
      const transactions = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        // Filter by currency in memory
        if (data.currency === currency) {
          transactions.push({ id: doc.id, ...data });
          
          if (data.type === 'deposit') {
            balance += data.amount;
          } else if (data.type === 'withdrawal') {
            balance -= data.amount;
          }
        }
      });

      // Sort transactions by createdAt in memory
      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return {
        success: true,
        balance: parseFloat(balance.toFixed(2)),
        currency,
        transactionCount: transactions.length,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting business balance:', error);
      return {
        success: false,
        error: error.message,
        balance: 0
      };
    }
  }

  // Record a withdrawal from business wallet
  async recordWithdrawal(amount, currency, payoutId, userEmail, description) {
    return this.recordBusinessTransaction(
      'withdrawal',
      amount,
      currency,
      description || `Withdrawal to ${userEmail}`,
      {
        payoutId,
        userEmail,
        withdrawalType: 'paypal_payout'
      }
    );
  }

  // Record a deposit to business wallet
  async recordDeposit(amount, currency, orderId, userEmail, description) {
    return this.recordBusinessTransaction(
      'deposit',
      amount,
      currency,
      description || `Deposit from ${userEmail}`,
      {
        orderId,
        userEmail,
        depositType: 'paypal_payment'
      }
    );
  }

  // Set initial business balance (for existing accounts)
  async setInitialBalance(amount, currency = 'CAD', description = 'Initial business balance') {
    try {
      // Check if there are any existing transactions
      const transactionsRef = this.firestore.collection('business_transactions');
      const snapshot = await transactionsRef.get();

      // Check if there are any transactions for this currency
      let hasTransactions = false;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.currency === currency) {
          hasTransactions = true;
        }
      });

      if (hasTransactions) {
        return {
          success: false,
          message: 'Business wallet already has transactions. Cannot set initial balance.'
        };
      }

      // Record initial balance as a deposit
      return this.recordBusinessTransaction(
        'deposit',
        amount,
        currency,
        description,
        {
          initialBalance: true,
          setupType: 'initial_balance'
        }
      );
    } catch (error) {
      console.error('❌ Error setting initial balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BusinessWalletService;
