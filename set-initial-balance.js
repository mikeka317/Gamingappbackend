#!/usr/bin/env node

// Script to set initial business balance
const BusinessWalletService = require('./src/services/businessWalletService');

async function setInitialBalance() {
  try {
    console.log('🏦 Setting initial business balance...');
    
    const businessWalletService = new BusinessWalletService();
    
    // Set initial balance to CAD 5061.15 (your current PayPal balance)
    const result = await businessWalletService.setInitialBalance(
      5061.15,
      'CAD',
      'Initial business balance - existing PayPal funds'
    );
    
    if (result.success) {
      console.log('✅ Initial balance set successfully!');
      console.log('📊 Details:', {
        transactionId: result.transactionId,
        amount: 'CAD 5061.15',
        description: 'Initial business balance - existing PayPal funds'
      });
      
      // Verify the balance
      const balance = await businessWalletService.getBusinessBalance('CAD');
      if (balance.success) {
        console.log('💰 Current business balance:', `CAD ${balance.balance}`);
      }
    } else {
      console.error('❌ Failed to set initial balance:', result.message || result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the script
setInitialBalance();
