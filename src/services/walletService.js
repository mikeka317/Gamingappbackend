const { firestore } = require('../config/firebase');

class WalletService {
  // Get user wallet balance from user document
  async getUserWallet(userId, username) {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      
      // Return wallet info in the expected format
      return {
        id: userId,
        userId,
        username,
        balance: userData.wallet || 0,
        currency: 'USD',
        createdAt: userData.createdAt || new Date(),
        updatedAt: userData.updatedAt || new Date()
      };
    } catch (error) {
      console.error('Error getting user wallet:', error);
      throw error;
    }
  }

  // Add funds to wallet (manual for now, easy to extend for Stripe/PayPal)
  async addFunds(userId, amount, description = 'Manual deposit', metadata = {}) {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      const newBalance = currentBalance + amount;
      
      // Update user wallet balance
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create transaction record
      const transaction = {
        walletId: userId,
        userId,
        username: userData.username,
        type: 'deposit',
        amount,
        description,
        status: 'completed',
        reference: `deposit_${Date.now()}`,
        metadata: metadata, // Include Stripe metadata
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store transaction in separate transactions collection and get the auto-generated ID
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Transaction stored in transactions collection:', {
        transactionId: transactionId,
        userId,
        amount,
        type: transaction.type
      });
      
      // Return transaction with new balance info
      return {
        ...transaction,
        id: transactionId,
        newBalance: newBalance,
        previousBalance: currentBalance
      };
    } catch (error) {
      console.error('Error adding funds:', error);
      throw error;
    }
  }

  // Deduct funds from wallet (for challenge participation)
  async deductFunds(userId, amount, challengeId, description = 'Challenge participation fee') {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      
      if (currentBalance < amount) {
        throw new Error('Insufficient funds');
      }
      
      const newBalance = currentBalance - amount;
      
      // Update user wallet balance
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create transaction record
      const transaction = {
        walletId: userId,
        userId,
        username: userData.username,
        type: 'challenge_deduction',
        amount: -amount, // Negative amount for deduction
        description,
        status: 'completed',
        reference: challengeId,
        metadata: { challengeId },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store transaction in separate transactions collection and get the auto-generated ID
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Deduction transaction stored in transactions collection:', {
        transactionId: transactionId,
        userId,
        amount,
        type: transaction.type
      });
      
      return {
        ...transaction,
        id: transactionId
      };
    } catch (error) {
      console.error('Error deducting funds:', error);
      throw error;
    }
  }

  // Award challenge reward to winner
  async awardReward(userId, amount, challengeId, description = 'Challenge reward') {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      const newBalance = currentBalance + amount;
      
      // Update user wallet balance
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create transaction record
      const transaction = {
        userId,
        username: userData.username,
        type: 'challenge_reward',
        amount,
        description,
        status: 'completed',
        reference: challengeId,
        metadata: { challengeId },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store transaction in separate transactions collection and get the auto-generated ID
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Reward transaction stored in transactions collection:', {
        transactionId: transactionId,
        userId,
        amount,
        type: transaction.type
      });
      
      return {
        ...transaction,
        id: transactionId
      };
    } catch (error) {
      console.error('Error awarding reward:', error);
      throw error;
    }
  }

  // Revoke a previously awarded reward (admin dispute reversal)
  async revokeReward(userId, amount, challengeId, description = 'Admin dispute reversal') {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new Error('User not found');
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      const newBalance = currentBalance - amount;
      await userRef.update({ wallet: newBalance, updatedAt: new Date() });

      const transaction = {
        userId,
        username: userData.username,
        type: 'admin_adjustment',
        amount: -amount, // negative to reverse
        description,
        status: 'completed',
        reference: challengeId,
        metadata: { challengeId, reversal: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      console.log('✅ Reward reversal stored:', { transactionId, userId, amount });
      return { ...transaction, id: transactionId };
    } catch (error) {
      console.error('Error revoking reward:', error);
      throw error;
    }
  }

  // Refund stake back to a user's wallet (used for draws/refunds)
  async refundStake(userId, amount, challengeId, description = 'Challenge refund') {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      const newBalance = currentBalance + amount;
      
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      const transaction = {
        userId,
        username: userData.username,
        type: 'refund',
        amount,
        description,
        status: 'completed',
        reference: challengeId,
        metadata: { challengeId },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Refund transaction stored in transactions collection:', {
        transactionId,
        userId,
        amount,
        type: transaction.type
      });
      
      return { ...transaction, id: transactionId };
    } catch (error) {
      console.error('Error refunding stake:', error);
      throw error;
    }
  }

  // Add admin fee to admin wallet
  async addAdminFee(amount, challengeId, description = 'Challenge admin fee') {
    try {
      const adminWalletRef = firestore.collection('admin_wallets').doc('main');
      const adminWalletDoc = await adminWalletRef.get();
      
      let adminWallet;
      
      if (adminWalletDoc.exists) {
        adminWallet = adminWalletDoc.data();
        const newBalance = adminWallet.balance + amount;
        const newTotalFees = adminWallet.totalFees + amount;
        
        await adminWalletRef.update({
          balance: newBalance,
          totalFees: newTotalFees,
          updatedAt: new Date()
        });
      } else {
        // Create admin wallet if it doesn't exist
        adminWallet = {
          id: 'main',
          balance: amount,
          currency: 'USD',
          totalFees: amount,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await adminWalletRef.set(adminWallet);
      }
      
      // Create transaction record for admin fee
      const transaction = {
        walletId: 'admin',
        userId: 'admin',
        username: 'Admin',
        type: 'admin_fee',
        amount,
        description,
        status: 'completed',
        reference: challengeId,
        metadata: { challengeId },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store transaction in separate transactions collection and get the auto-generated ID
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Admin fee transaction stored in transactions collection:', {
        transactionId: transactionId,
        challengeId,
        amount,
        type: transaction.type
      });
    } catch (error) {
      console.error('Error adding admin fee:', error);
      throw error;
    }
  }

  // Get user transaction history
  async getUserTransactions(userId, limit = 50) {
    try {
      console.log('🔍 Fetching transactions for user:', userId);
      
      // Validate userId parameter
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid userId parameter');
      }
      
      const transactionsRef = firestore.collection('transactions')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      const snapshot = await transactionsRef.get();
      const transactions = snapshot.docs.map(doc => doc.data());
      
      console.log('✅ Fetched transactions from transactions collection:', {
        userId,
        count: transactions.length,
        types: transactions.map(t => t.type)
      });
      
      return transactions;
    } catch (error) {
      console.error('❌ Error getting user transactions:', error);
      throw error;
    }
  }

  // Get transaction by Stripe session ID
  async getTransactionByStripeSession(stripeSessionId) {
    try {
      console.log('🔍 Looking for transaction with Stripe session ID:', stripeSessionId);
      
      // Search in the transactions collection
      const transactionsRef = firestore.collection('transactions');
      const transactionSnapshot = await transactionsRef
        .where('metadata.stripeSessionId', '==', stripeSessionId)
        .limit(1)
        .get();
      
      if (!transactionSnapshot.empty) {
        const transaction = transactionSnapshot.docs[0].data();
        console.log('✅ Found existing transaction:', {
          transactionId: transaction.id,
          userId: transaction.userId,
          amount: transaction.amount,
          stripeSessionId: transaction.metadata?.stripeSessionId
        });
        return transaction;
      }
      
      console.log('⚠️ No transaction found for Stripe session ID:', stripeSessionId);
      return null;
    } catch (error) {
      console.error('Error getting transaction by Stripe session ID:', error);
      return null;
    }
  }

  // Get all transactions (for admin purposes)
  async getAllTransactions(limit = 100) {
    try {
      console.log('🔍 Fetching all transactions from collection');
      
      // Validate limit parameter
      if (limit && (typeof limit !== 'number' || limit <= 0 || limit > 1000)) {
        throw new Error('Invalid limit parameter. Must be between 1 and 1000.');
      }
      
      const transactionsRef = firestore.collection('transactions')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      const snapshot = await transactionsRef.get();
      const transactions = snapshot.docs.map(doc => doc.data());
      
      console.log('✅ Fetched all transactions:', {
        count: transactions.length,
        types: [...new Set(transactions.map(t => t.type))]
      });
      
      return transactions;
    } catch (error) {
      console.error('❌ Error getting all transactions:', error);
      throw error;
    }
  }

  // Get transaction statistics for a user
  async getUserTransactionStats(userId) {
    try {
      console.log('🔍 Fetching transaction stats for user:', userId);
      
      // Validate userId parameter
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid userId parameter');
      }
      
      const transactionsRef = firestore.collection('transactions')
        .where('userId', '==', userId);
      
      const snapshot = await transactionsRef.get();
      const transactions = snapshot.docs.map(doc => doc.data());
      
      const stats = transactions.reduce((acc, transaction) => {
        if (transaction.type === 'deposit') {
          acc.totalDeposits += Math.abs(transaction.amount);
        } else if (transaction.type === 'withdrawal') {
          acc.totalWithdrawals += Math.abs(transaction.amount);
        } else if (transaction.type === 'challenge_reward') {
          acc.totalRewards += Math.abs(transaction.amount);
        } else if (transaction.type === 'challenge_deduction') {
          acc.totalDeductions += Math.abs(transaction.amount);
        }
        acc.totalTransactions++;
        return acc;
      }, {
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalRewards: 0,
        totalDeductions: 0,
        totalTransactions: 0
      });
      
      console.log('✅ User transaction stats calculated:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Error getting user transaction stats:', error);
      throw error;
    }
  }

  // Get user wallet balance
  async getWalletBalance(userId) {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log('⚠️ User document not found for wallet balance:', userId);
        return 0;
      }
      
      const userData = userDoc.data();
      console.log('💰 User wallet data:', {
        userId,
        username: userData.username,
        walletField: userData.wallet,
        hasWalletField: 'wallet' in userData,
        userDataKeys: Object.keys(userData)
      });
      
      // Initialize wallet if it doesn't exist
      if (!('wallet' in userData)) {
        console.log('💰 Initializing wallet for user:', userId);
        await userRef.update({
          wallet: 1000, // Give new users $1000 starting balance
          updatedAt: new Date()
        });
        console.log('✅ Wallet initialized with $1000');
        return 1000;
      }
      
      const balance = userData.wallet || 0;
      console.log('💰 Final wallet balance:', balance);
      
      return balance;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  // Process challenge completion and distribute rewards
  async processChallengeCompletion(challengeId, winnerId, totalStake) {
    try {
      const adminFee = totalStake * 0.05; // 5% admin fee
      const winnerReward = totalStake * 0.95; // 95% to winner
      
      // Award reward to winner
      await this.awardReward(winnerId, winnerReward, challengeId, 'Challenge victory reward');
      
      // Add admin fee
      await this.addAdminFee(adminFee, challengeId, 'Challenge admin fee');
      
      console.log(`✅ Challenge ${challengeId} completed. Winner: ${winnerId}, Reward: $${winnerReward}, Admin Fee: $${adminFee}`);
    } catch (error) {
      console.error('Error processing challenge completion:', error);
      throw error;
    }
  }

  // Process withdrawal - handles multi-gateway wallet scenario
  async processWithdrawal(userId, amount, description = 'Withdrawal', preferredPayoutMethod = 'paypal') {
    try {
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      
      if (currentBalance < amount) {
        throw new Error('Insufficient funds');
      }
      
      const newBalance = currentBalance - amount;
      
      // Update user wallet balance
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create withdrawal transaction record
      const transaction = {
        walletId: userId,
        userId,
        username: userData.username,
        type: 'withdrawal',
        amount: -amount, // Negative amount for withdrawal
        description,
        status: 'pending', // Will be updated when payout is processed
        reference: `withdrawal_${Date.now()}`,
        metadata: { 
          payoutMethod: preferredPayoutMethod,
          withdrawalId: `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Store transaction in separate transactions collection and get the auto-generated ID
      const transactionRef = await firestore.collection('transactions').add(transaction);
      const transactionId = transactionRef.id;
      
      console.log('✅ Withdrawal transaction stored:', {
        transactionId: transactionId,
        userId,
        amount,
        payoutMethod: preferredPayoutMethod,
        newBalance
      });
      
      // In a real implementation, you would:
      // 1. Check your platform's available balances across PayPal, Stripe, bank accounts
      // 2. Decide which source to use for the payout
      // 3. Initiate the actual payout to the user
      // 4. Update the transaction status to 'completed' when payout succeeds
      
      // For now, we'll simulate the payout process
      const payoutResult = await this.simulatePayout(amount, preferredPayoutMethod);
      
      // Update transaction status based on payout result
      if (payoutResult.success) {
        await firestore.collection('transactions').doc(transactionId).update({
          status: 'completed',
          metadata: {
            ...transaction.metadata,
            payoutId: payoutResult.payoutId,
            completedAt: new Date()
          }
        });
        
        console.log('✅ Withdrawal completed successfully:', payoutResult);
      } else {
        // If payout fails, we could potentially refund the user's wallet
        // For now, we'll keep the transaction as pending
        console.log('⚠️ Payout failed, transaction remains pending:', payoutResult);
      }
      
      return {
        ...transaction,
        id: transactionId,
        newBalance,
        previousBalance: currentBalance,
        payoutResult
      };
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      throw error;
    }
  }
  
  // Simulate payout process (replace with real PayPal/Stripe payout logic)
  async simulatePayout(amount, payoutMethod) {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate successful payout (in reality, this would call PayPal/Stripe APIs)
      const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`💰 Simulating ${payoutMethod} payout: $${amount} (ID: ${payoutId})`);
      
      return {
        success: true,
        payoutId,
        amount,
        method: payoutMethod,
        status: 'completed',
        message: `Successfully processed ${payoutMethod} payout of $${amount}`
      };
    } catch (error) {
      console.error('Error simulating payout:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to process ${payoutMethod} payout`
      };
    }
  }

  // Refund challenge participants (for disputes, cancellations, etc.)
  async refundChallengeParticipants(challengeId, participants, stakeAmount) {
    try {
      const validParticipants = (participants || []).filter(Boolean);
      for (const participantId of validParticipants) {
        await this.refundStake(participantId, stakeAmount, challengeId, 'Challenge draw refund');
      }
      
      console.log(`✅ Refunded ${validParticipants.length} participants (stake: ${stakeAmount}) for challenge ${challengeId}`);
    } catch (error) {
      console.error('Error refunding challenge participants:', error);
      throw error;
    }
  }

  // Process tournament entry fee deduction
  async processTournamentEntry(userId, entryFee, tournamentId) {
    try {
      console.log(`💰 Processing tournament entry fee: ${entryFee} for user ${userId}`);
      
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      
      if (currentBalance < entryFee) {
        throw new Error('Insufficient funds for tournament entry');
      }
      
      const newBalance = currentBalance - entryFee;
      
      // Update user wallet
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create transaction record
      await firestore.collection('transactions').add({
        userId,
        type: 'tournament_entry',
        amount: entryFee,
        balance: newBalance,
        description: `Tournament entry fee - Tournament ${tournamentId}`,
        status: 'completed',
        createdAt: new Date(),
        tournamentId
      });
      
      console.log(`✅ Tournament entry fee processed: ${entryFee} deducted from user ${userId}`);
      
      return {
        success: true,
        newBalance,
        entryFee
      };
    } catch (error) {
      console.error('❌ Error processing tournament entry:', error);
      throw error;
    }
  }

  // Process tournament reward distribution
  async processTournamentReward(tournamentId, winnerId, tournament) {
    try {
      console.log(`🏆 Processing tournament reward for winner ${winnerId}`);
      
      const totalPrize = tournament.participants.length * tournament.entryFee;
      const winnerReward = Math.floor(totalPrize * tournament.winnerReward);
      const adminReward = Math.floor(totalPrize * tournament.adminReward);
      
      console.log(`💰 Prize distribution: Total=${totalPrize}, Winner=${winnerReward}, Admin=${adminReward}`);
      
      // Award winner
      await this.awardReward(winnerId, winnerReward, `Tournament ${tournamentId} winner prize`);
      
      // Award admin
      await this.addAdminFee(adminReward, `Tournament ${tournamentId} admin fee`);
      
      // Create tournament completion record
      await firestore.collection('tournamentRewards').add({
        tournamentId,
        winnerId,
        totalPrize,
        winnerReward,
        adminReward,
        participants: tournament.participants.length,
        completedAt: new Date()
      });
      
      console.log(`✅ Tournament reward processed: Winner received ${winnerReward}, Admin received ${adminReward}`);
      
      return {
        success: true,
        totalPrize,
        winnerReward,
        adminReward
      };
    } catch (error) {
      console.error('❌ Error processing tournament reward:', error);
      throw error;
    }
  }

  // Refund tournament entry fee
  async refundTournamentEntry(userId, entryFee, tournamentId) {
    try {
      console.log(`💸 Refunding tournament entry fee: ${entryFee} to user ${userId}`);
      
      const userRef = firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      const currentBalance = userData.wallet || 0;
      const newBalance = currentBalance + entryFee;
      
      // Update user wallet
      await userRef.update({
        wallet: newBalance,
        updatedAt: new Date()
      });
      
      // Create transaction record
      await firestore.collection('transactions').add({
        userId,
        type: 'tournament_refund',
        amount: entryFee,
        balance: newBalance,
        description: `Tournament entry refund - Tournament ${tournamentId}`,
        status: 'completed',
        createdAt: new Date(),
        tournamentId
      });
      
      console.log(`✅ Tournament entry refunded: ${entryFee} added to user ${userId}`);
      
      return {
        success: true,
        newBalance,
        refundAmount: entryFee
      };
    } catch (error) {
      console.error('❌ Error refunding tournament entry:', error);
      throw error;
    }
  }
}

const walletService = new WalletService();

module.exports = { 
  WalletService,
  processChallengeCompletion: walletService.processChallengeCompletion.bind(walletService),
  awardReward: walletService.awardReward.bind(walletService),
  addAdminFee: walletService.addAdminFee.bind(walletService),
  refundStake: walletService.refundStake.bind(walletService),
  processWithdrawal: walletService.processWithdrawal.bind(walletService),
  processTournamentEntry: walletService.processTournamentEntry.bind(walletService),
  processTournamentReward: walletService.processTournamentReward.bind(walletService),
  refundTournamentEntry: walletService.refundTournamentEntry.bind(walletService)
};
