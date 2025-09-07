const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { ensureOwnData, ensureAdmin, logWalletAccess } = require('../middleware/userAccess');
const multer = require('multer');
const { WalletService } = require('../services/walletService');
const { DisputeService } = require('../services/disputeService');
const { PayPalService } = require('../services/paypalService');
const { storage } = require('../config/firebase');
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
    const { amount, description, preferredPayoutMethod, payoutEmail, bankAccountId } = req.body;
    
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
    
    if (preferredPayoutMethod === 'paypal') {
      // PayPal payout with multi-source platform balance logic (PayPal + Stripe)
      if (!payoutEmail) {
        return res.status(400).json({
          success: false,
          message: 'PayPal email is required for PayPal payouts'
        });
      }

      const paypalService = new PayPalService();
      let paypalAvailable = 0;
      let stripeAvailable = 0;
      const sourceBreakdown = { paypal: 0, stripe: 0 };

      // Attempt to get PayPal available balance (USD)
      try {
        const bal = await paypalService.getBalances(false);
        const balances = bal?.data?.balances;
        if (Array.isArray(balances)) {
          const usd = balances.find(b => (b.currency || b.currency_code) === 'USD');
          const availableField = usd?.available_balance || {};
          const val = typeof availableField === 'object'
            ? (availableField.value || availableField.amount)
            : availableField;
          paypalAvailable = val ? parseFloat(val) : 0;
        } else if (typeof bal?.data?.computedBalance === 'number') {
          // Fallback computed value (not real available); best-effort only
          paypalAvailable = Math.max(0, parseFloat(String(bal.data.computedBalance)) || 0);
        }
      } catch (e) {
        // If unauthorized or any error, treat as 0
        paypalAvailable = 0;
      }

      // Get Stripe platform available balance (USD)
      try {
        const stripeBal = await stripe.balance.retrieve();
        const avail = Array.isArray(stripeBal?.available) ? stripeBal.available : [];
        stripeAvailable = avail
          .filter(e => (e.currency || '').toLowerCase() === 'usd')
          .reduce((sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 0), 0) / 100; // cents -> USD
      } catch (e) {
        stripeAvailable = 0;
      }

      // Decide how to fund this payout from platform balances
      if (amount <= paypalAvailable) {
        sourceBreakdown.paypal = amount;
      } else if (amount <= paypalAvailable + stripeAvailable) {
        sourceBreakdown.paypal = Math.max(0, paypalAvailable);
        sourceBreakdown.stripe = amount - sourceBreakdown.paypal;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Withdrawal not possible: insufficient platform funds',
          data: {
            requested: amount,
            paypalAvailable,
            stripeAvailable,
            combinedAvailable: Number((paypalAvailable + stripeAvailable).toFixed(2))
          }
        });
      }

      // Perform the payout to the user's PayPal account for the full requested amount
      const payoutResult = await paypalService.processPayout(
        amount,
        payoutEmail,
        description || 'Withdrawal from Cyber Duel Grid'
      );

      if (payoutResult.success) {
        withdrawalResult = await walletService.processWithdrawal(
          req.user.uid,
          amount,
          description || 'PayPal withdrawal',
          'paypal'
        );
        withdrawalResult.paypalPayoutId = payoutResult.payoutId;
        withdrawalResult.paypalStatus = payoutResult.status;
        withdrawalResult.sourceBreakdown = sourceBreakdown;
        withdrawalResult.platformBalances = { paypalAvailable, stripeAvailable };
      } else {
        return res.status(500).json({
          success: false,
          message: 'PayPal payout failed',
          error: payoutResult.error
        });
      }
      
    } else if (preferredPayoutMethod === 'stripe') {
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
      // Default withdrawal processing
      withdrawalResult = await walletService.processWithdrawal(
        req.user.uid,
        amount,
        description || 'Withdrawal',
        preferredPayoutMethod || 'manual'
      );
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
    
    // Credit user's wallet
    const transaction = await walletService.addFunds(
      req.user.uid,
      amount,
      captured ? 'PayPal deposit completed' : 'PayPal deposit verified',
      captureMeta
    );
    
    return res.json({
      success: true,
      message: captured ? 'Payment captured and funds added to wallet' : 'Payment verified and funds added to wallet',
      data: {
        transaction,
        amount,
        status: captureMeta.paypalStatus || 'COMPLETED'
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
    return res.status(500).json({ success: false, message: 'Failed to fetch PayPal balance', error: result.error });
  } catch (error) {
    console.error('Error fetching PayPal balance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch PayPal balance', error: error.message });
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
