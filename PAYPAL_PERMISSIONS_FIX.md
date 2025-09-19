# 🔧 PayPal API Permissions Fix Guide

## 🚨 Current Issue
Your PayPal app is missing the required permissions to access the **Reporting APIs**, which are needed to fetch account balances and transaction history.

**Error:** `403 NOT_AUTHORIZED - Authorization failed due to insufficient permissions`

## ✅ Solution: Enable Reporting Permissions

### Step 1: Access PayPal Developer Portal
1. Go to [https://developer.paypal.com/](https://developer.paypal.com/)
2. Sign in with your PayPal account
3. Navigate to **"My Apps & Credentials"**

### Step 2: Select Your App
1. Find your app (the one you're using for Cyber Duel Grid)
2. Click on the app name to open its details

### Step 3: Enable Reporting Features
1. Click on the **"Features"** tab
2. Look for **"Reporting"** section
3. Enable the following features:
   - ✅ **Account Balance API**
   - ✅ **Transaction Search API**
   - ✅ **Transaction Details API**

### Step 4: Update App Permissions
1. Go to **"App Settings"** tab
2. Under **"Advanced Options"**, make sure these are enabled:
   - ✅ **Read Account Information**
   - ✅ **Read Transaction History**
   - ✅ **Read Balance Information**

### Step 5: Save and Test
1. Click **"Save"** to apply changes
2. Wait 5-10 minutes for changes to propagate
3. Test the balance API again

## 🔍 Alternative: Use Different PayPal App

If you can't modify the current app, create a new one:

### Create New PayPal App
1. In PayPal Developer Portal, click **"Create App"**
2. App Name: `Cyber Duel Grid - Full Access`
3. Select **"Business"** account type
4. **IMPORTANT:** During creation, make sure to enable:
   - ✅ All reporting features
   - ✅ Balance access
   - ✅ Transaction history

### Update Environment Variables
Update your `.env` file with the new credentials:
```bash
# Replace with new app credentials
Paypal_Client_ID=your_new_client_id
Paypal_Secret_Key=your_new_secret_key
```

## 🧪 Test the Fix

After enabling permissions, test the balance API:

```bash
# Test the balance endpoint
curl -X GET "http://localhost:5072/api/wallet/paypal/balance" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📋 Required PayPal Permissions Summary

Your PayPal app needs these specific permissions:

| Permission | Purpose | Required for |
|------------|---------|--------------|
| `https://uri.paypal.com/services/reporting/balance` | Read account balance | Balance display |
| `https://uri.paypal.com/services/reporting/transactions` | Read transaction history | Balance calculation |
| `https://uri.paypal.com/services/reporting/transaction-details` | Read transaction details | Detailed reporting |

## ⚠️ Important Notes

1. **Sandbox vs Live**: Make sure you're updating the correct environment (sandbox for development, live for production)
2. **Propagation Time**: Changes can take 5-10 minutes to take effect
3. **Business Account**: You need a PayPal Business account for reporting APIs
4. **Webhook Setup**: Consider setting up webhooks for real-time balance updates

## 🔄 After Fixing Permissions

Once permissions are enabled:
1. Restart your backend server
2. Try accessing the PayPal balance again
3. You should see real balance data instead of errors

## 🆘 Still Having Issues?

If you're still getting permission errors:
1. Double-check that you're using the correct app credentials
2. Verify the app is in the same environment (sandbox/live) as your testing
3. Check PayPal Developer Portal for any pending approvals
4. Contact PayPal support if permissions are still not working

---

**Next Step:** Follow the steps above to enable reporting permissions, then test the balance API again.
