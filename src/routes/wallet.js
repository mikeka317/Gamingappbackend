const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { ensureOwnData, ensureAdmin, logWalletAccess } = require('../middleware/userAccess');
const multer = require('multer');
const { WalletService } = require('../services/walletService');
const { DisputeService } = require('../services/disputeService');
const { PayPalService } = require('../services/paypalService');
const BusinessWalletService = require('../services/businessWalletService');
const { storage, firestore } = require('../config/firebase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();
const walletService = new WalletService();
const disputeService = new DisputeService();

// Multer for dispute evidence (in-memory)
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  }
});

// Get user wallet
router.get('/', authenticateToken, logWalletAccess, async (req, res) => {
  try {
    const wallet = await walletService.getUserWallet(req.user.uid, req.user.username);
    
    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Error getting wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet',
      error: error.message
    });
  }
});

// Get wallet balance
router.get('/balance', authenticateToken, logWalletAccess, async (req, res) => {
  try {
    const balance = await walletService.getWalletBalance(req.user.uid);
    
    res.json({
      success: true,
      data: { balance }
    });
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      error: error.message
    });
  }
});

// Add funds to wallet (manual for now, easy to extend for Stripe/PayPal)
router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    const transaction = await walletService.addFunds(
      req.user.uid, 
      amount, 
      description || 'Manual deposit',
      { paymentMethod: 'manual' }
    );
    
    res.json({
      success: true,
      message: 'Funds added successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Error adding funds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add funds',
      error: error.message
    });
  }
});

// PayPal deposit endpoint - creates PayPal order
router.post('/paypal-deposit', authenticateToken, async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    // Initialize PayPal service
    const paypalService = new PayPalService();
    
    // Create PayPal order
    const customId = `deposit_${req.user.uid}_${Date.now()}`;
    const orderResult = await paypalService.createOrder(
      amount,
      description || `PayPal deposit of $${amount}`,
      customId
    );
    
    if (!orderResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create PayPal order',
        error: orderResult.error
      });
    }
    
    res.json({
      success: true,
      message: 'PayPal order created successfully',
      data: {
        orderId: orderResult.orderId,
        approvalUrl: orderResult.approvalUrl,
        amount,
        description: description || `PayPal deposit of $${amount}`
      }
    });
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create PayPal order',
      error: error.message
    });
  }
});

// Get transaction history
router.get('/transactions', authenticateToken, logWalletAccess, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const transactions = await walletService.getUserTransactions(
      req.user.uid, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transactions',
      error: error.message
    });
  }
});

// Get transaction statistics
router.get('/stats', authenticateToken, logWalletAccess, async (req, res) => {
  try {
    const stats = await walletService.getUserTransactionStats(req.user.uid);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction stats',
      error: error.message
    });
  }
});

// Get all transactions (admin only)
router.get('/all', authenticateToken, ensureAdmin, logWalletAccess, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const transactions = await walletService.getAllTransactions(parseInt(limit));
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error getting all transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get all transactions',
      error: error.message
    });
  }
});

// Create dispute
router.post('/dispute', authenticateToken, evidenceUpload.array('evidenceFiles', 10), async (req, res) => {
  try {
    const { challengeId } = req.body;
    let { opponentId, opponentUsername, disputeReason, evidence } = req.body;
    // Normalize common alt field names
    if (!disputeReason) disputeReason = req.body.reason || req.body.dispute_reason || req.body.reasonText;
    if (!opponentUsername) opponentUsername = req.body.opponent || req.body.opponent_name;
    
    // Derive opponent info from challenge if not provided
    if (challengeId && (!opponentUsername || !opponentId)) {
      try {
        const { firestore } = require('../config/firebase');
        const challengeDoc = await firestore.collection('challenges').doc(challengeId).get();
        if (challengeDoc.exists) {
          const c = challengeDoc.data();
          // If requester is challenger, opponent is first opponent username
          if (c?.challenger?.uid === req.user.uid) {
            opponentUsername = opponentUsername || (Array.isArray(c?.opponents) && c.opponents[0]?.username) || opponentUsername;
            opponentId = opponentId || (Array.isArray(c?.opponents) && c.opponents[0]?.uid) || opponentId || null;
          } else {
            opponentUsername = opponentUsername || c?.challenger?.username || opponentUsername;
            opponentId = opponentId || c?.challenger?.uid || opponentId || null;
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to infer opponent from challenge:', e?.message || e);
      }
    }

    if (!challengeId || !opponentUsername || !disputeReason) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Check if user already has an active dispute for this challenge
    const hasActiveDispute = await disputeService.hasActiveDispute(challengeId, req.user.uid);
    if (hasActiveDispute) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active dispute for this challenge'
      });
    }

    // Collect evidence URLs: from body and from uploaded files (Storage preferred)
    let evidenceUrls = Array.isArray(evidence) ? evidence : (evidence ? [evidence] : []);

    if (Array.isArray(req.files) && req.files.length > 0) {
      if (!storage) {
        return res.status(500).json({
          success: false,
          message: 'File storage service not available'
        });
      }
      const uploadPromises = req.files.map(async (file, idx) => {
        try {
          const bucket = storage.bucket();
          const ext = (file.originalname || '').split('.').pop();
          const safeExt = ext ? `.${ext}` : '';
          const path = `disputes/${req.user.uid}/${challengeId}/${Date.now()}_${idx}${safeExt}`;
          const fileRef = bucket.file(path);
          await fileRef.save(file.buffer, {
            metadata: {
              contentType: file.mimetype,
              metadata: {
                uploadedBy: req.user.uid,
                originalName: file.originalname,
                type: 'dispute-evidence',
                challengeId,
                uploadedAt: new Date().toISOString()
              }
            }
          });
          const [signedUrl] = await fileRef.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365 // ~1 year
          });
          return signedUrl;
        } catch (e) {
          console.error('⚠️ Storage upload failed:', e?.message || e);
          throw new Error('Failed to upload evidence to Firebase Storage. Please check bucket configuration.');
        }
      });
      const uploaded = await Promise.all(uploadPromises);
      evidenceUrls = [...evidenceUrls, ...uploaded];
    }

    const dispute = await disputeService.createDispute({
      challengeId,
      challengerId: req.user.uid,
      challengerUsername: req.user.username,
      opponentId: opponentId || null,
      opponentUsername,
      disputeReason,
      evidence: evidenceUrls
    });
    
    res.json({
      success: true,
      message: 'Dispute created successfully',
      data: dispute
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dispute',
      error: error.message
    });
  }
});

// Get user disputes
router.get('/disputes', authenticateToken, async (req, res) => {
  try {
    const disputes = await disputeService.getUserDisputes(req.user.uid);
    
    res.json({
      success: true,
      data: disputes
    });
  } catch (error) {
    console.error('Error getting user disputes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get disputes',
      error: error.message
    });
  }
});

// Get dispute by ID
router.get('/disputes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = await disputeService.getDisputeById(id);
    
    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: 'Dispute not found'
      });
    }
    
    // Check if user is involved in this dispute
    if (dispute.challengerId !== req.user.uid && dispute.opponentId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
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



// Withdrawal endpoint - handles multi-gateway wallet scenario
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, description, preferredPayoutMethod, method, payoutEmail, paypalEmail, bankAccountId, currency: bodyCurrency } = req.body;
    
    // Use method or preferredPayoutMethod (frontend compatibility)
    const payoutMethod = preferredPayoutMethod || method;
    const emailForPayout = payoutEmail || paypalEmail;
    const currency = (bodyCurrency || 'CAD').toUpperCase();
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    // Check if user has sufficient balance
    const currentBalance = await walletService.getWalletBalance(req.user.uid);
    if (currentBalance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient funds'
      });
    }
    
    // Process withdrawal using the preferred payout method
    let withdrawalResult;
    
    if (payoutMethod === 'paypal') {
      // Direct PayPal payout - no Firebase, no complex balance checking
      if (!emailForPayout) {
        return res.status(400).json({
          success: false,
          message: 'PayPal email is required for PayPal payouts'
        });
      }

      console.log('🔄 Processing direct PayPal withdrawal...', {
        amount,
        emailForPayout,
        description: description || 'Withdrawal from Cyber Duel Grid'
      });

      const paypalService = new PayPalService();
      
      // Process PayPal payout directly
      const payoutResult = await paypalService.processPayout(
        amount,
        emailForPayout,
        description || 'Withdrawal from Cyber Duel Grid',
        currency
      );
      
      console.log('📊 PayPal payout result:', payoutResult);

      // Check payout status after a short delay
      if (payoutResult.success && payoutResult.payoutId) {
        console.log('⏳ Waiting 2 seconds before checking payout status...');
        setTimeout(async () => {
          try {
            const statusResult = await paypalService.getPayoutStatus(payoutResult.payoutId);
            console.log('📊 PayPal payout status check:', statusResult);
          } catch (error) {
            console.error('❌ Error checking payout status:', error);
          }
        }, 2000);
      }

      if (payoutResult.success) {
        // Deduct from user's wallet (using wallet service for this part only)
        const userRef = firestore.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }
        
        const userData = userDoc.data();
        const currentBalance = userData.wallet || 0;
        
        if (currentBalance < amount) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient funds in user wallet'
          });
        }
        
        const newBalance = currentBalance - amount;
        
        // Update user wallet balance
        await userRef.update({
          wallet: newBalance,
          updatedAt: new Date()
        });
        
        // Create withdrawal transaction record
        const transaction = {
          walletId: req.user.uid,
          userId: req.user.uid,
          username: userData.username,
          type: 'withdrawal',
          amount: -amount, // Negative amount for withdrawal
          description: description || 'PayPal withdrawal',
          status: 'completed', // PayPal payout was successful
          reference: `withdrawal_${Date.now()}`,
          metadata: { 
            payoutMethod: 'paypal',
            withdrawalId: `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            paypalPayoutId: payoutResult.payoutId,
            paypalStatus: payoutResult.status
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Store transaction in separate transactions collection
        const transactionRef = await firestore.collection('transactions').add(transaction);
        const transactionId = transactionRef.id;
        
        withdrawalResult = {
          ...transaction,
          id: transactionId,
          newBalance,
          previousBalance: currentBalance,
          payoutResult: {
            success: true,
            payoutId: payoutResult.payoutId,
            amount: amount,
            method: 'paypal',
            status: payoutResult.status,
            message: `Successfully processed PayPal payout of ${currency} ${amount}`
          }
        };
        
        console.log('✅ Direct PayPal withdrawal completed successfully:', {
          payoutId: payoutResult.payoutId,
          amount: amount,
          email: emailForPayout,
          newBalance: newBalance
        });
      } else {
        console.error('❌ PayPal payout failed:', payoutResult.error);
        return res.status(500).json({
          success: false,
          message: 'PayPal payout failed',
          error: payoutResult.error,
          details: 'The withdrawal could not be processed. Please try again or contact support.'
        });
      }
      
    } else if (payoutMethod === 'stripe') {
      // Stripe withdrawal - call Stripe withdrawal endpoint directly
      try {
        const stripeResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:5072'}/api/stripe/withdraw`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${req.headers.authorization?.split(' ')[1]}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount,
            description,
            bankDetails: req.body.bankDetails
          })
        });
        
        const stripeData = await stripeResponse.json();
        
        if (stripeResponse.ok && stripeData.success) {
          return res.json({
            success: true,
            message: stripeData.message,
            data: stripeData.data
          });
        } else {
          return res.status(stripeResponse.status).json({
            success: false,
            message: stripeData.message || 'Stripe withdrawal failed',
            error: stripeData.error
          });
        }
      } catch (stripeError) {
        console.error('Error calling Stripe withdrawal:', stripeError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process Stripe withdrawal',
          error: stripeError.message
        });
      }
      
    } else {
      // Unsupported withdrawal method
      return res.status(400).json({
        success: false,
        message: `Unsupported withdrawal method: ${payoutMethod}. Supported methods: paypal, stripe`
      });
    }
    
    res.json({
      success: true,
      message: 'Withdrawal initiated successfully',
      data: withdrawalResult
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
      error: error.message
    });
  }
});

// PayPal webhook endpoint to handle payment confirmations
router.post('/paypal/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = req.body;
    
    // Verify webhook signature in production
    // For now, we'll process the event directly
    
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource;
      const customId = capture.custom_id;
      
      // Extract user ID and amount from custom ID
      const [type, userId, timestamp] = customId.split('_');
      
      if (type === 'deposit' && userId) {
        // Add funds to user's wallet
        const amount = parseFloat(capture.amount.value);
        const transaction = await walletService.addFunds(
          userId,
          amount,
          'PayPal deposit completed',
          {
            paymentMethod: 'paypal',
            paypalOrderId: capture.id,
            paypalCaptureId: capture.id,
            webhookVerified: true
          }
        );
        
        console.log('✅ PayPal webhook: Funds added to wallet:', {
          userId,
          amount,
          transactionId: transaction.id
        });
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// PayPal payment verification endpoint
router.post('/paypal/verify-payment', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    // Initialize PayPal service
    const paypalService = new PayPalService();
    
    // First, try to capture the order (most reliable way to complete the payment)
    let captured = false;
    let amount = 0;
    let captureMeta = {};
    try {
      const captureResult = await paypalService.capturePayment(orderId);
      if (captureResult && captureResult.success) {
        captured = true;
        amount = parseFloat(captureResult.amount);
        captureMeta = {
          paymentMethod: 'paypal',
          paypalOrderId: orderId,
          paypalCaptureId: captureResult.captureId,
          paypalStatus: captureResult.status,
          capturedVia: 'verify-endpoint'
        };
      }
    } catch (e) {
      // If capture fails (already captured or not approved), fall back to verification
      console.warn('⚠️ PayPal capture attempt failed, falling back to verify:', e?.message || e);
    }
    
    if (!captured) {
      // Verify the payment status if capture did not occur
      const verificationResult = await paypalService.verifyPayment(orderId);
      if (!(verificationResult && verificationResult.success)) {
        return res.status(400).json({
          success: false,
          message: 'Payment not completed',
          data: verificationResult
        });
      }
      amount = parseFloat(verificationResult.amount);
      captureMeta = {
        paymentMethod: 'paypal',
        paypalOrderId: orderId,
        paypalStatus: verificationResult.status,
        manuallyVerified: true
      };
    }
    
    // Record business wallet deposit
    const businessWalletService = new BusinessWalletService();
    const businessDeposit = await businessWalletService.recordDeposit(
      amount,
      'USD', // PayPal deposits are typically in USD
      orderId,
      req.user.email || 'unknown',
      captured ? 'PayPal deposit completed' : 'PayPal deposit verified'
    );

    if (!businessDeposit.success) {
      console.error('❌ Failed to record business deposit:', businessDeposit.error);
      // Continue with user deposit even if business tracking fails
    }

    // Credit user's wallet
    const transaction = await walletService.addFunds(
      req.user.uid,
      amount,
      captured ? 'PayPal deposit completed' : 'PayPal deposit verified',
      captureMeta
    );
    
    console.log('✅ Deposit completed successfully:', {
      userDeposit: transaction,
      businessDeposit: businessDeposit,
      amount: amount
    });
    
    return res.json({
      success: true,
      message: captured ? 'Payment captured and funds added to wallet' : 'Payment verified and funds added to wallet',
      data: {
        transaction,
        amount,
        status: captureMeta.paypalStatus || 'COMPLETED',
        businessTransactionId: businessDeposit.transactionId
      }
    });
  } catch (error) {
    console.error('Error verifying PayPal payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

// Future: PayPal payment integration (legacy endpoint)
router.post('/paypal/create-order', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    // This endpoint is now deprecated, use /paypal-deposit instead
    res.json({
      success: false,
      message: 'This endpoint is deprecated. Use /paypal-deposit instead.',
      data: {
        deprecated: true
      }
    });
  } catch (error) {
    console.error('Error with deprecated PayPal endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Endpoint deprecated',
      error: error.message
    });
  }
});

// Get PayPal platform account balance (for display/testing)
router.get('/paypal/balance', authenticateToken, async (req, res) => {
  try {
    // Allow all authenticated users in non-production; require admin in production
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !(req.user && req.user.isAdmin)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    const paypalService = new PayPalService();
    const fullRange = (req.query.fullRange || '').toString().toLowerCase() === 'true';
    const result = await paypalService.getBalances(fullRange);
    if (result.success) {
      return res.json({ success: true, data: result.data });
    }
    
    // Provide more specific error message for PayPal API issues
    const errorMessage = result.error?.includes('NOT_AUTHORIZED') 
      ? 'PayPal API permissions not configured. Please check PayPal app settings.'
      : 'Failed to fetch PayPal balance';
      
    return res.status(500).json({ 
      success: false, 
      message: errorMessage, 
      error: result.error,
      requiresPayPalSetup: true
    });
  } catch (error) {
    console.error('Error fetching PayPal balance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch PayPal balance', error: error.message });
  }
});

// Set initial business balance (admin only)
router.post('/business-balance/set-initial', authenticateToken, async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !(req.user && req.user.isAdmin)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    
    const { amount, currency = 'CAD', description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    
    const businessWalletService = new BusinessWalletService();
    const result = await businessWalletService.setInitialBalance(amount, currency, description);
    
    if (result.success) {
      return res.json({
        success: true,
        message: 'Initial business balance set successfully',
        data: {
          transactionId: result.transactionId,
          amount,
          currency
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to set initial balance',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error setting initial business balance:', error);
    res.status(500).json({ success: false, message: 'Failed to set initial balance', error: error.message });
  }
});

// Get business wallet balance (real-time)
router.get('/business-balance', authenticateToken, async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !(req.user && req.user.isAdmin)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    
    // Fetch directly from PayPal business account
    const paypalService = new PayPalService();
    const balanceResult = await paypalService.getBalances(true); // fullRange = true for complete data
    
    if (balanceResult.success) {
      const balanceData = balanceResult.data;
      return res.json({ 
        success: true, 
        data: {
          balance: balanceData.computedBalance || 0,
          currency: balanceData.currency || 'CAD',
          allCurrencies: balanceData.allCurrencies || {},
          transactionCount: balanceData.transactionCount || 0,
          lastUpdated: new Date().toISOString(),
          source: 'paypal_direct'
        }
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch PayPal business balance', 
        error: balanceResult.error,
        requiresPayPalSetup: balanceResult.error?.includes('NOT_AUTHORIZED')
      });
    }
  } catch (error) {
    console.error('Error getting PayPal business balance:', error);
    res.status(500).json({ success: false, message: 'Failed to get PayPal business balance', error: error.message });
  }
});

// PayPal diagnostics endpoint to quickly verify permissions
router.get('/paypal/diagnostics', authenticateToken, async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !(req.user && req.user.isAdmin)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }
    const paypalService = new PayPalService();
    const result = await paypalService.diagnose();
    if (result.success) {
      return res.json({ success: true, data: result.data });
    }
    return res.status(500).json({ success: false, message: 'Diagnostics failed', error: result.error });
  } catch (error) {
    console.error('Error running PayPal diagnostics:', error);
    res.status(500).json({ success: false, message: 'Diagnostics failed', error: error.message });
  }
});

module.exports = router;
