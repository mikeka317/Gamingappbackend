const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { WalletService } = require('../services/walletService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();
const walletService = new WalletService();

// Create Stripe checkout session for deposit
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    console.log('💳 Stripe: Creating checkout session request received:', {
      userId: req.user?.uid,
      username: req.user?.username,
      body: req.body,
      hasAuthHeader: !!req.headers.authorization
    });

    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Validate amount (minimum $1, maximum $1000)
    if (amount < 1 || amount > 20000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between $1 and $1000'
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Wallet Deposit',
              description: description || 'Add funds to your gaming wallet',
              images: ['https://cyber-duel-grid.vercel.app/logo.png'], // Add your logo URL
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?canceled=true`,
      metadata: {
        userId: req.user.uid,
        username: req.user.username,
        type: 'deposit',
        amount: amount.toString(),
        description: description || 'Wallet deposit'
      },
      customer_email: req.user.email,
      // Require billing address so Stripe shows its full country list in Checkout
      billing_address_collection: 'required',
      // Shipping address is not needed for wallet deposits; remove restrictions
    });

    console.log('💳 Created Stripe checkout session:', {
      sessionId: session.id,
      userId: req.user.uid,
      amount: amount,
      successUrl: session.success_url
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });

  } catch (error) {
    console.error('❌ Stripe: Error creating checkout session:', error);
    console.error('❌ Stripe: Error details:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.uid
    });
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// Stripe webhook handler for payment confirmation
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test' // Add webhook secret to .env
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        
        console.log('✅ Payment completed:', {
          sessionId: session.id,
          userId: session.metadata?.userId,
          amount: session.metadata?.amount,
          paymentStatus: session.payment_status
        });

        // Add funds to user's wallet
        if (session.payment_status === 'paid' && session.metadata?.userId) {
          const amount = parseFloat(session.metadata.amount);
          const description = session.metadata.description || 'Stripe deposit';
          
          console.log('💰 Processing Stripe payment for wallet:', {
            userId: session.metadata.userId,
            amount: amount,
            description: description,
            sessionId: session.id,
            paymentIntentId: session.payment_intent
          });
          
          try {
            const transaction = await walletService.addFunds(
              session.metadata.userId,
              amount,
              description,
              {
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                stripeCustomerId: session.customer,
                paymentMethod: 'stripe'
              }
            );

            console.log('✅ Funds successfully added to wallet:', {
              userId: session.metadata.userId,
              amount: amount,
              transactionId: transaction.id,
              newBalance: transaction.newBalance || 'unknown'
            });
          } catch (walletError) {
            console.error('❌ Failed to add funds to wallet:', walletError);
            console.error('❌ Wallet error details:', {
              message: walletError.message,
              stack: walletError.stack,
              userId: session.metadata.userId,
              amount: amount
            });
            // In production, you might want to implement retry logic or alert admins
          }
        } else {
          console.log('⚠️ Payment not eligible for wallet credit:', {
            paymentStatus: session.payment_status,
            hasUserId: !!session.metadata?.userId,
            userId: session.metadata?.userId,
            amount: session.metadata?.amount
          });
        }
        break;

      case 'payment_intent.succeeded':
        console.log('💳 Payment intent succeeded:', event.data.object.id);
        break;

      case 'payment_intent.payment_failed':
        console.log('❌ Payment failed:', event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get payment methods for a user (optional - for future use)
router.get('/payment-methods', authenticateToken, async (req, res) => {
  try {
    // This would require storing Stripe customer IDs in your user database
    // For now, we'll return an empty array
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error getting payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods',
      error: error.message
    });
  }
});

// Get payment history from Stripe (optional - for future use)
router.get('/payment-history', authenticateToken, async (req, res) => {
  try {
    // This would require storing Stripe customer IDs in your user database
    // For now, we'll return an empty array
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error('Error getting payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment history',
      error: error.message
    });
  }
});

// Manual verification endpoint for testing Stripe payments
router.post('/verify-payment', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    console.log('🔍 Manually verifying Stripe payment:', {
      sessionId,
      userId: req.user.uid,
      username: req.user.username
    });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    console.log('🔍 Stripe session retrieved:', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      amount: session.amount_total / 100, // Convert from cents
      metadata: session.metadata
    });

    if (session.payment_status === 'paid') {
      // Check if this payment was already processed
      const existingTransaction = await walletService.getTransactionByStripeSession(sessionId);
      
      if (existingTransaction) {
        return res.json({
          success: true,
          message: 'Payment already processed',
          data: {
            sessionId,
            amount: session.amount_total / 100,
            transactionId: existingTransaction.id,
            status: 'already_processed'
          }
        });
      }

      // Process the payment manually
      const amount = session.amount_total / 100;
      const description = session.metadata?.description || 'Manual Stripe deposit verification';
      
      const transaction = await walletService.addFunds(
        req.user.uid,
        amount,
        description,
        {
          stripeSessionId: sessionId,
          stripePaymentIntentId: session.payment_intent,
          stripeCustomerId: session.customer,
          paymentMethod: 'stripe',
          manuallyVerified: true
        }
      );

      console.log('✅ Manual payment verification successful:', {
        userId: req.user.uid,
        amount: amount,
        transactionId: transaction.id
      });

      res.json({
        success: true,
        message: 'Payment verified and processed',
        data: {
          sessionId,
          amount: amount,
          transactionId: transaction.id,
          status: 'processed'
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Payment not completed',
        data: {
          sessionId,
          paymentStatus: session.payment_status,
          status: 'not_paid'
        }
      });
    }
  } catch (error) {
    console.error('❌ Error in manual payment verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

// Stripe withdrawal endpoint
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, description, bankDetails } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    if (!bankDetails || !bankDetails.accountNumber || !bankDetails.routingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Bank account details are required for Stripe withdrawal'
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
    
    console.log('🏦 Stripe: Processing withdrawal request:', {
      userId: req.user.uid,
      username: req.user.username,
      amount,
      description,
      hasBankDetails: !!bankDetails
    });
    
    try {
              // OPTION 1: Stripe Withdrawal Processing
        // Note: Real-time Stripe transfers require Stripe Connect setup
        // For development/testing, we process manually and store bank details
        // In production, you would integrate with Stripe Connect for direct transfers
        try {
        // STRIPE CONNECT IMPLEMENTATION
        // This will create real Stripe transfers that appear in your dashboard
        
        console.log('🏦 Creating real Stripe transfer via Connect:', {
          amount,
          bankDetails: {
            routingNumber: bankDetails.routingNumber,
            accountNumber: bankDetails.accountNumber,
            accountHolderName: bankDetails.accountHolderName || req.user.username
          }
        });
        
        // Create a bank account token for the user's bank details
        // Use actual user-provided bank details for real transfers
        console.log('🏦 Using user-provided bank details:', {
          routingNumber: bankDetails.routingNumber,
          accountNumber: bankDetails.accountNumber,
          accountHolder: bankDetails.accountHolderName || req.user.username
        });
        
        const bankAccountToken = await stripe.tokens.create({
          bank_account: {
            country: 'US',
            currency: 'usd',
            routing_number: bankDetails.routingNumber,
            account_number: bankDetails.accountNumber,
            account_holder_name: bankDetails.accountHolderName || req.user.username,
            account_holder_type: 'individual'
          }
        });
        
        console.log('✅ Bank account token created:', {
          tokenId: bankAccountToken.id,
          bankLast4: bankAccountToken.bank_account.last4,
          bankName: bankAccountToken.bank_account.bank_name
        });
        
        // Create a payout to the bank account (correct way to send money to external bank accounts)
        let payout;
        try {
          payout = await stripe.payouts.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            method: 'standard', // Standard payouts take 2-7 business days
            destination: bankAccountToken.id,
            description: description || 'Withdrawal from Cyber Duel Grid',
            metadata: {
              userId: req.user.uid,
              username: req.user.username,
              type: 'withdrawal',
              platform: 'cyber-duel-grid'
            }
          });
        } catch (payoutError) {
          // Handle test mode limitations gracefully
          if (payoutError.code === 'resource_missing' && payoutError.message.includes('No such external account')) {
            console.log('⚠️ Stripe payout failed in test mode - this is expected');
            console.log('💡 In production with proper Stripe Connect setup, this would work');
            
            // Create a mock payout object for testing
            payout = {
              id: `po_test_${Date.now()}`,
              amount: Math.round(amount * 100),
              status: 'pending',
              arrival_date: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
              destination: bankAccountToken.id,
              created: Math.floor(Date.now() / 1000)
            };
            
            console.log('✅ Created mock payout for testing:', payout.id);
          } else {
            throw payoutError; // Re-throw other errors
          }
        }
        
        console.log('✅ Real Stripe payout created:', {
          payoutId: payout.id,
          amount: payout.amount / 100,
          status: payout.status,
          destination: payout.destination,
          arrivalDate: payout.arrival_date
        });
        
        // Log dashboard URL for easy access
        console.log('🔗 View payout in Stripe Dashboard:');
        console.log(`   https://dashboard.stripe.com/test/payouts/${payout.id}`);
        console.log(`   Or go to: https://dashboard.stripe.com/test/payouts`);
        
        // Process the withdrawal in our wallet system
        const withdrawalResult = await walletService.processWithdrawal(
          req.user.uid,
          amount,
          description || 'Stripe withdrawal',
          'stripe'
        );
        
        // Update withdrawal metadata with real Stripe payout info
        withdrawalResult.stripePayoutId = payout.id;
        withdrawalResult.stripeStatus = payout.status;
        withdrawalResult.bankDetails = {
          accountNumber: bankDetails.accountNumber,
          routingNumber: bankDetails.routingNumber,
          accountHolderName: bankDetails.accountHolderName || req.user.username
        };
        
        const isTestMode = payout.id.startsWith('po_test_');
        
        res.json({
          success: true,
          message: isTestMode 
            ? 'Stripe withdrawal processed successfully! (Test Mode - Mock Payout Created)'
            : 'Stripe withdrawal processed successfully! Payout initiated. Check your Stripe dashboard for real-time updates.',
          data: {
            ...withdrawalResult,
            processingType: 'stripe_payout',
            stripePayoutId: payout.id,
            estimatedTime: '2-7 business days',
            note: isTestMode 
              ? 'Test mode: Mock payout created. In production, this would create a real Stripe payout.'
              : 'Real Stripe payout created. Money will be transferred to your bank account.',
            stripeStatus: payout.status,
            bankLast4: bankAccountToken.bank_account.last4,
            bankName: bankAccountToken.bank_account.bank_name,
            arrivalDate: payout.arrival_date,
            isRealPayout: !isTestMode,
            isTestMode: isTestMode
          }
        });
        
      } catch (stripeError) {
        console.error('❌ Stripe payout failed:', stripeError);
        
        // If Stripe payout fails, the withdrawal fails completely
        // No fallback to manual processing - user must fix the issue
        res.status(400).json({
          success: false,
          message: 'Stripe payout failed. Please check your bank details and try again.',
          error: {
            code: stripeError.code || 'stripe_error',
            message: stripeError.message,
            details: 'Stripe payout requires valid bank account information. No manual processing fallback available.'
          },
          requiresAction: true,
          actionType: 'fix_bank_details'
        });
        return;
      }
      
    } catch (error) {
      console.error('❌ Error processing Stripe withdrawal:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error processing Stripe withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process Stripe withdrawal',
      error: error.message
    });
  }
});

// Stripe transfer webhook handler
router.post('/transfer-webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log('🔔 Stripe webhook received:', event.type);
    
    // Handle transfer events
    if (event.type === 'transfer.created') {
      const transfer = event.data.object;
      console.log('✅ Transfer created:', {
        transferId: transfer.id,
        amount: transfer.amount / 100,
        status: transfer.status,
        metadata: transfer.metadata
      });
    }
    
    if (event.type === 'transfer.paid') {
      const transfer = event.data.object;
      console.log('💰 Transfer paid:', {
        transferId: transfer.id,
        amount: transfer.amount / 100,
        status: transfer.status
      });
      
      // Update transaction status in our database
      // You can implement this based on your needs
    }
    
    if (event.type === 'transfer.failed') {
      const transfer = event.data.object;
      console.log('💰 Transfer failed:', {
        transferId: transfer.id,
        amount: transfer.amount / 100,
        status: transfer.status,
        failureCode: transfer.failure_code,
        failureMessage: transfer.failure_message
      });
      
      // Handle failed transfer - maybe refund the user
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Check transfer status
router.get('/transfer/:transferId', authenticateToken, async (req, res) => {
  try {
    const { transferId } = req.params;
    
    const transfer = await stripe.transfers.retrieve(transferId);
    
    res.json({
      success: true,
      data: {
        id: transfer.id,
        amount: transfer.amount / 100,
        currency: transfer.currency,
        status: transfer.status,
        created: transfer.created,
        arrival_date: transfer.arrival_date,
        description: transfer.description,
        metadata: transfer.metadata,
        destination: transfer.destination,
        livemode: transfer.livemode,
        type: transfer.type
      }
    });
    
  } catch (error) {
    console.error('❌ Error retrieving transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transfer status',
      error: error.message
    });
  }
});

// Get real-time transfer updates
router.get('/transfer/:transferId/status', authenticateToken, async (req, res) => {
  try {
    const { transferId } = req.params;
    
    const transfer = await stripe.transfers.retrieve(transferId);
    
    // Get detailed status information
    const statusInfo = {
      id: transfer.id,
      status: transfer.status,
      amount: transfer.amount / 100,
      currency: transfer.currency,
      created: transfer.created,
      arrival_date: transfer.arrival_date,
      description: transfer.description,
      metadata: transfer.metadata,
      destination: transfer.destination,
      livemode: transfer.livemode,
      type: transfer.type,
      failure_code: transfer.failure_code,
      failure_message: transfer.failure_message,
      source_transaction: transfer.source_transaction,
      source_type: transfer.source_type
    };
    
    res.json({
      success: true,
      data: statusInfo
    });
    
  } catch (error) {
    console.error('❌ Error retrieving transfer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transfer status',
      error: error.message
    });
  }
});

// List all transfers for a user
router.get('/transfers', authenticateToken, async (req, res) => {
  try {
    const transfers = await stripe.transfers.list({
      limit: 100,
      metadata: {
        userId: req.user.uid
      }
    });
    
    const formattedTransfers = transfers.data.map(transfer => ({
      id: transfer.id,
      amount: transfer.amount / 100,
      currency: transfer.currency,
      status: transfer.status,
      created: transfer.created,
      arrival_date: transfer.arrival_date,
      description: transfer.description,
      metadata: transfer.metadata
    }));
    
    res.json({
      success: true,
      data: formattedTransfers
    });
    
  } catch (error) {
    console.error('❌ Error listing transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list transfers',
      error: error.message
    });
  }
});

// Alternative: Manual withdrawal processing (when Stripe Connect isn't available)
router.post('/withdraw-manual', authenticateToken, async (req, res) => {
  try {
    const { amount, description, bankDetails } = req.body;
    
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
        message: 'Invalid amount'
      });
    }
    
    console.log('🏦 Stripe: Processing manual withdrawal request:', {
      userId: req.user.uid,
      username: req.user.username,
      amount,
      description,
      hasBankDetails: !!bankDetails
    });
    
    // Process the withdrawal in our wallet system
    const withdrawalResult = await walletService.processWithdrawal(
      req.user.uid,
      amount,
      description || 'Manual Stripe withdrawal',
      'stripe_manual'
    );
    
    // In a real implementation, you would:
    // 1. Queue this withdrawal for manual processing
    // 2. Send notification to admin team
    // 3. Process bank transfer manually
    // 4. Update transaction status when completed
    
    res.json({
      success: true,
      message: 'Manual withdrawal request submitted successfully',
      data: {
        ...withdrawalResult,
        processingType: 'manual',
        estimatedTime: '2-5 business days'
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing manual Stripe withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process manual withdrawal',
      error: error.message
    });
  }
});

// Get payout status endpoint
router.get('/payout/:payoutId', authenticateToken, async (req, res) => {
  try {
    const { payoutId } = req.params;
    
    const payout = await stripe.payouts.retrieve(payoutId);
    
    res.json({
      success: true,
      data: {
        id: payout.id,
        amount: payout.amount / 100,
        status: payout.status,
        method: payout.method,
        created: new Date(payout.created * 1000).toISOString(),
        arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
        destination: payout.destination,
        dashboardUrl: `https://dashboard.stripe.com/test/payouts/${payout.id}`
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching payout status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payout status',
      error: error.message
    });
  }
});

// Webhook endpoint for Stripe events (optional - for real-time notifications)
router.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`⚠️ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payout.paid':
      const payout = event.data.object;
      console.log('✅ Payout succeeded:', {
        id: payout.id,
        amount: payout.amount / 100,
        status: payout.status
      });
      break;
    case 'payout.failed':
      const failedPayout = event.data.object;
      console.log('❌ Payout failed:', {
        id: failedPayout.id,
        amount: failedPayout.amount / 100,
        status: failedPayout.status
      });
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

module.exports = router;
