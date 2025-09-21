const fetch = require('node-fetch');

async function testWithdrawalAPI() {
  try {
    console.log('🧪 Testing Withdrawal API Directly...\n');
    
    // Test data
    const testData = {
      amount: 10,
      description: 'Test withdrawal via API',
      bankDetails: {
        accountHolderName: 'Test User',
        routingNumber: '110000000',
        accountNumber: '000123456789'
      }
    };
    
    console.log('📝 Test Data:');
    console.log(`   Amount: $${testData.amount}`);
    console.log(`   Account Holder: ${testData.bankDetails.accountHolderName}`);
    console.log(`   Routing Number: ${testData.bankDetails.routingNumber}`);
    console.log(`   Account Number: ${testData.bankDetails.accountNumber}`);
    
    console.log('\n🔄 Making API request...');
    
    // Make request to withdrawal endpoint
    const response = await fetch('http://localhost:5072/api/stripe/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // This will fail auth, but we can see the response structure
      },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    
    console.log('\n📊 API Response:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Message: ${result.message}`);
    
    if (result.error) {
      console.log(`   Error: ${result.error.message || result.error}`);
    }
    
    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
    }
    
    console.log('\n💡 Note: This test will fail authentication, but shows the API structure');
    console.log('   For real testing, use the frontend with a valid user session');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWithdrawalAPI();
