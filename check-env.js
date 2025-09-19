#!/usr/bin/env node

// Quick script to check environment variables
console.log('🔍 Environment Variables Check:');
console.log('================================');

console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'not set');

// Simulate the getFrontendUrl logic
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

const frontendUrl = getFrontendUrl();
console.log('Computed Frontend URL:', frontendUrl);
console.log('Return URL:', `${frontendUrl}/profile?success=true`);
console.log('Cancel URL:', `${frontendUrl}/profile?canceled=true`);

console.log('\n💡 If the URL is wrong:');
console.log('1. Check your .env file for FRONTEND_URL');
console.log('2. Make sure it points to: https://gamingappfrontend.onrender.com');
console.log('3. Remove any trailing slashes');
console.log('4. Restart your backend server');
