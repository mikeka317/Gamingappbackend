# PayPal Integration Setup Guide

## 🔑 Required Environment Variables

Add these to your `backend/.env` file:

```bash
# PayPal Configuration
PAYPAL_CLIENT_ID=your_actual_paypal_client_id
PAYPAL_CLIENT_SECRET=your_actual_paypal_client_secret

# Other existing variables...
FRONTEND_URL=http://localhost:8080
NODE_ENV=development
```

## 📋 How to Get PayPal Credentials

### 1. PayPal Developer Account
1. Go to [PayPal Developer Portal](https://developer.paypal.com/)
2. Sign in with your PayPal account
3. Navigate to "My Apps & Credentials"

### 2. Create App
1. Click "Create App"
2. Give it a name (e.g., "Cyber Duel Grid")
3. Select "Business" account type
4. Click "Create App"

### 3. Get Credentials
1. Copy the **Client ID** and **Client Secret**
2. For testing, use **Sandbox** credentials
3. For production, use **Live** credentials

## 🧪 Testing PayPal Integration

### Sandbox Environment
- Use sandbox credentials for development
- Test with PayPal sandbox accounts
- No real money involved

### Production Environment
- Use live credentials for production
- Real money transactions
- Requires PayPal business account verification

## 🔄 PayPal Flow

### Deposit Flow:
1. User enters amount → `POST /api/wallet/paypal-deposit`
2. Backend creates PayPal order
3. User redirected to PayPal for payment
4. PayPal redirects back with success/cancel
5. Backend verifies payment via webhook or manual verification
6. Funds added to user's wallet

### Withdrawal Flow:
1. User requests withdrawal → `POST /api/wallet/withdraw`
2. Backend processes PayPal payout
3. Funds sent to user's PayPal email
4. Transaction marked as completed

## 🚀 Next Steps

1. **Add your PayPal credentials** to `.env` file
2. **Test with sandbox accounts** first
3. **Configure webhooks** for production
4. **Update frontend** to handle PayPal redirects
5. **Test deposit and withdrawal flows**

## ⚠️ Important Notes

- **Never commit** `.env` file to version control
- **Use sandbox** for development and testing
- **Verify webhooks** in production
- **Handle errors** gracefully
- **Log all transactions** for audit purposes

## 🔧 Troubleshooting

### Common Issues:
1. **Invalid credentials** - Check your PayPal app settings
2. **Webhook failures** - Verify webhook URL and signature
3. **Payment verification** - Use manual verification as fallback
4. **Environment mismatch** - Ensure sandbox/live consistency

### Testing Tools:
- PayPal Sandbox accounts
- PayPal Developer Dashboard
- Webhook testing tools
- Network request monitoring
