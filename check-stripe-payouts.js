require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkStripePayouts() {
  try {
    console.log('🔍 Checking Recent Stripe Payouts...\n');

    // Get recent payouts
    const payouts = await stripe.payouts.list({
      limit: 10,
      expand: ['data.destination']
    });

    if (payouts.data.length === 0) {
      console.log('   ℹ️  No recent payouts found.');
      console.log('   💡 Make sure you have attempted a withdrawal from the frontend.');
    } else {
      console.log(`   ✅ Found ${payouts.data.length} recent payout(s):`);
      
      payouts.data.forEach((payout, index) => {
        console.log(`\n   --- Payout ${index + 1} ---`);
        console.log(`   ID: ${payout.id}`);
        console.log(`   Amount: $${(payout.amount / 100).toFixed(2)}`);
        console.log(`   Status: ${payout.status}`);
        console.log(`   Method: ${payout.method}`);
        console.log(`   Created: ${new Date(payout.created * 1000).toLocaleString()}`);
        console.log(`   Arrival Date: ${payout.arrival_date ? new Date(payout.arrival_date * 1000).toLocaleString() : 'N/A'}`);
        
        if (payout.destination) {
          console.log(`   Destination: ${payout.destination.object} - ${payout.destination.last4 || 'N/A'}`);
        }
        
        console.log(`   Dashboard URL: https://dashboard.stripe.com/test/payouts/${payout.id}`);
      });
    }

    console.log('\n🎯 Dashboard Links:');
    console.log('   📊 All Payouts: https://dashboard.stripe.com/test/payouts');
    console.log('   💰 Balance: https://dashboard.stripe.com/test/balance');
    console.log('   📈 Activity: https://dashboard.stripe.com/test/events');

  } catch (error) {
    console.error('❌ Error checking Stripe payouts:', error);
  } finally {
    process.exit(0);
  }
}

checkStripePayouts();
