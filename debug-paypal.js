#!/usr/bin/env node

// Debug script to test PayPal URL generation
console.log('🔍 PayPal URL Debug:');
console.log('===================');

// Simulate the getFrontendUrl function
function getFrontendUrl() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (process.env.FRONTEND_URL) {
    const url = process.env.FRONTEND_URL.trim();
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
  
  if (isProduction) {
    return 'https://gamingappfrontend.onrender.com';
  } else {
    return 'http://localhost:8080';
  }
}

console.log('Environment Variables:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- FRONTEND_URL:', process.env.FRONTEND_URL || 'not set');
console.log('- PWD:', process.env.PWD);

console.log('\nComputed URLs:');
const frontendUrl = getFrontendUrl();
console.log('- Frontend URL:', frontendUrl);
console.log('- Return URL:', `${frontendUrl}/profile?success=true`);
console.log('- Cancel URL:', `${frontendUrl}/profile?canceled=true`);

console.log('\n💡 If the URL is wrong:');
console.log('1. Create a .env file in the backend directory with:');
console.log('   NODE_ENV=development');
console.log('   FRONTEND_URL=http://localhost:8080');
console.log('2. Restart your backend server');
console.log('3. Make sure you\'re running the backend locally, not on Render');
