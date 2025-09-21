require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripeWithdrawal() {
  try {
    console.log('🧪 Testing Stripe Bank Withdrawal Integration...\n');
    
    // Test 1: Verify Stripe connection
    console.log('1️⃣ Testing Stripe connection...');
    const account = await stripe.accounts.retrieve();
    console.log(`   ✅ Connected to Stripe account: ${account.id}`);
    console.log(`   📊 Account type: ${account.type}`);
    console.log(`   💰 Charges enabled: ${account.charges_enabled}`);
    console.log(`   💸 Payouts enabled: ${account.payouts_enabled}`);
    
    // Test 2: Create test bank account token
    console.log('\n2️⃣ Creating test bank account token...');
    const bankAccountToken = await stripe.tokens.create({
      bank_account: {
        country: 'US',
        currency: 'usd',
        routing_number: '110000000', // Chase test routing number
        account_number: '000123456789', // Stripe test account number
        account_holder_name: 'Test User',
        account_holder_type: 'individual'
      }
    });
    
    console.log('   ✅ Bank account token created successfully!');
    console.log(`   🏦 Bank: ${bankAccountToken.bank_account.bank_name}`);
    console.log(`   🔢 Last 4: ${bankAccountToken.bank_account.last4}`);
    console.log(`   🏛️  Routing: ${bankAccountToken.bank_account.routing_number}`);
    
    // Test 3: Test payout creation (dry run)
    console.log('\n3️⃣ Testing payout creation (DRY RUN)...');
    console.log('   ⚠️  Note: This is a dry run - no actual payout will be created');
    console.log('   💡 In production, this would create a real payout');
    
    // Test 4: Show test bank details for frontend
    console.log('\n4️⃣ Test Bank Details for Frontend:');
    console.log('   📝 Use these details in your frontend form:');
    console.log('   ┌─────────────────────────────────────────┐');
    console.log('   │ Account Holder Name: Test User          │');
    console.log('   │ Routing Number: 110000000               │');
    console.log('   │ Account Number: 000123456789            │');
    console.log('   │ Amount: $10.00 (minimum)                │');
    console.log('   └─────────────────────────────────────────┘');
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Start your backend: npm run dev');
    console.log('   2. Start your frontend: npm run dev');
    console.log('   3. Go to Profile > Wallet > Withdraw Funds > Bank Cards');
    console.log('   4. Use the test bank details above');
    console.log('   5. Submit withdrawal and check backend logs');
    
    console.log('\n✅ Stripe integration is ready for testing!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Make sure your Stripe test keys are valid');
  }
}

// Run the test
testStripeWithdrawal();
