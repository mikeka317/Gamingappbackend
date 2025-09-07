const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { DisputeService } = require('../services/disputeService');
const { WalletService } = require('../services/walletService');
const { firestore } = require('../config/firebase');
const UserService = require('../services/userService');

const router = express.Router();
const disputeService = new DisputeService();
const walletService = new WalletService();
const userService = new UserService();

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    // Accept either explicit isAdmin flag or username 'admin'
    const isAdmin = Boolean(req.user?.isAdmin) || (req.user?.username || '').toLowerCase() === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

// Get all disputes (admin only)
router.get('/disputes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const disputes = await disputeService.getAllDisputes();
    
    res.json({
      success: true,
      data: disputes
    });
  } catch (error) {
    console.error('Error getting disputes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get disputes',
      error: error.message
    });
  }
});

// Get dispute by ID (admin only)
router.get('/disputes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = await disputeService.getDisputeById(id);
    
    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }
    
    res.json({
      success: true,
      data: dispute
    });
  } catch (error) {
    console.error('Error getting dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dispute',
      error: error.message
    });
  }
});

// Update dispute status (admin only)
router.put('/disputes/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    await disputeService.updateDisputeStatus(id, status, adminNotes);
    
    res.json({
      success: true,
      message: 'Dispute status updated successfully'
    });
  } catch (error) {
    console.error('Error updating dispute status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update dispute status',
      error: error.message
    });
  }
});

// Resolve dispute (admin only)
router.post('/disputes/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, adminNotes } = req.body;
    
    if (!resolution) {
      return res.status(400).json({
        success: false,
        message: 'Resolution is required'
      });
    }
    
    await disputeService.resolveDispute(id, resolution, req.user.username, adminNotes);
    
    // Get the dispute to process the resolution
    const dispute = await disputeService.getDisputeById(id);
    if (dispute) {
      // Process the resolution based on the decision
      await handlePrizeDistribution(dispute, resolution);
    }
    
    res.json({
      success: true,
      message: 'Dispute resolved successfully'
    });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve dispute',
      error: error.message
    });
  }
});

// Get dispute statistics (admin only)
router.get('/disputes/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await disputeService.getDisputeStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting dispute stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dispute stats',
      error: error.message
    });
  }
});

// Get admin wallet (admin only)
router.get('/wallet', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminWalletRef = firestore.collection('admin_wallets').doc('main');
    const adminWalletDoc = await adminWalletRef.get();
    
    if (!adminWalletDoc.exists) {
      return res.json({
        success: true,
        data: {
          balance: 0,
          currency: 'USD',
          totalFees: 0
        }
      });
    }
    
    const adminWallet = adminWalletDoc.data();
    
    res.json({
      success: true,
      data: adminWallet
    });
  } catch (error) {
    console.error('Error getting admin wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin wallet',
      error: error.message
    });
  }
});

// Get admin transactions (admin only)
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
          const transactionsRef = firestore.collection('admin_wallets').doc('main')
        .collection('transactions')
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit));
      
      const snapshot = await transactionsRef.get();
      const transactions = snapshot.docs.map(doc => doc.data());
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error getting admin transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin transactions',
      error: error.message
    });
  }
});

// Helper function to handle prize distribution after dispute resolution
async function handlePrizeDistribution(dispute, resolution) {
  try {
    const { challengeId } = dispute;
    let { challengerId, opponentId, challengerUsername, opponentUsername } = dispute;
    
    // Get the challenge to determine stake amount
    const challengeRef = firestore.collection('challenges').doc(challengeId);
    const challengeDoc = await challengeRef.get();
    
    if (!challengeDoc.exists) {
      console.error('Challenge not found for dispute resolution:', challengeId);
      return;
    }
    
    const challenge = challengeDoc.data();
    const stakeAmount = challenge.stake || 0;

    // Resolve missing userIds from usernames/challenge
    const resolveUidByUsername = async (username) => {
      try {
        if (!username) return null;
        const profile = await userService.getUserByUsername(username);
        return profile?.uid || null;
      } catch (_) { return null; }
    };

    if (!challengerId) {
      challengerId = challenge?.challenger?.uid || (await resolveUidByUsername(challengerUsername || challenge?.challenger?.username));
    }
    if (!opponentId) {
      // Try from dispute username first
      let uid = await resolveUidByUsername(opponentUsername);
      if (!uid && Array.isArray(challenge?.opponents)) {
        const oppUser = challenge.opponents[0]?.username;
        uid = await resolveUidByUsername(oppUser);
      }
      opponentId = uid || null;
    }
    
    switch (resolution) {
      case 'challenger_wins':
        if (challengerId) {
          await walletService.processChallengeCompletion(challengeId, challengerId, stakeAmount * 2);
        } else {
          console.warn('⚠️ Unable to resolve challengerId for dispute resolution. Skipping credit.');
        }
        break;
        
      case 'opponent_wins':
        if (opponentId) {
          // If a previous winner exists on challenge, revoke their 95% reward first
          const previousWinnerUsername = challenge?.winner;
          if (previousWinnerUsername) {
            let previousWinnerUid = null;
            if (challenge?.challenger?.username === previousWinnerUsername) previousWinnerUid = challenge?.challenger?.uid;
            if (!previousWinnerUid && Array.isArray(challenge?.opponents)) {
              const match = challenge.opponents.find(o => o.username === previousWinnerUsername);
              if (match) previousWinnerUid = await resolveUidByUsername(match.username);
            }
            if (previousWinnerUid && previousWinnerUid !== opponentId) {
              await walletService.revokeReward(previousWinnerUid, stakeAmount * 0.95 * 2, challengeId, 'Dispute reversal - reward revoked');
            }
          }
          await walletService.processChallengeCompletion(challengeId, opponentId, stakeAmount * 2);
        } else {
          console.warn('⚠️ Unable to resolve opponentId for dispute resolution. Skipping credit.');
        }
        break;
        
      case 'split': {
        // Draw: refund exactly what each party actually contributed (typically 50% of stake)
        const challengerRefund = (challenge?.challengerDeduction || (stakeAmount * 0.5));
        let opponentRefund = stakeAmount * 0.5;
        if (Array.isArray(challenge?.opponents) && challenge.opponents.length > 0) {
          const oppEntry = challenge.opponents.find(o => !!o?.opponentDeduction) || challenge.opponents[0];
          opponentRefund = (oppEntry?.opponentDeduction || opponentRefund);
        }

        if (challengerId) {
          await walletService.refundStake(challengerId, challengerRefund, challengeId, 'Challenge draw refund');
        }
        if (opponentId) {
          await walletService.refundStake(opponentId, opponentRefund, challengeId, 'Challenge draw refund');
        }
        break;
      }
        
      case 'refund': {
        // Refund: same as draw — return actual contributions per participant
        const challengerRefund = (challenge?.challengerDeduction || (stakeAmount * 0.5));
        let opponentRefund = stakeAmount * 0.5;
        if (Array.isArray(challenge?.opponents) && challenge.opponents.length > 0) {
          const oppEntry = challenge.opponents.find(o => !!o?.opponentDeduction) || challenge.opponents[0];
          opponentRefund = (oppEntry?.opponentDeduction || opponentRefund);
        }

        if (challengerId) {
          await walletService.refundStake(challengerId, challengerRefund, challengeId, 'Challenge refund');
        }
        if (opponentId) {
          await walletService.refundStake(opponentId, opponentRefund, challengeId, 'Challenge refund');
        }
        break;
      }
        
      default:
        console.warn('Unknown dispute resolution:', resolution);
    }
    
    // Update challenge status to completed
    await challengeRef.update({
      status: 'completed',
      disputeResolved: true,
      disputeResolution: resolution,
      updatedAt: new Date()
    });
    
    console.log(`✅ Dispute ${dispute.id} resolved with ${resolution}. Prize distribution completed.`);
  } catch (error) {
    console.error('Error handling prize distribution:', error);
    throw error;
  }
}

module.exports = router;


