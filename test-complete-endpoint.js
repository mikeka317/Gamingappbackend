const axios = require('axios');

async function testCompleteEndpoint() {
  try {
    console.log('🧪 Testing /complete endpoint...');
    
    // Test data
    const testData = {
      aiResult: {
        winner: 'testuser',
        iWin: true,
        confidence: 0.95,
        reasoning: 'Test reasoning',
        score: '6-4'
      },
      completedAt: new Date().toISOString()
    };
    
    // You'll need to replace this with actual values
    const challengeId = 'test-challenge-id';
    const authToken = 'your-auth-token';
    
    const response = await axios.post(`http://localhost:5072/api/challenges/${challengeId}/complete`, testData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Complete endpoint test successful:', response.data);
    
  } catch (error) {
    console.error('❌ Complete endpoint test failed:', error.response?.data || error.message);
  }
}

// Run the test
testCompleteEndpoint();
