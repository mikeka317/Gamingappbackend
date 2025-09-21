# 🔍 Stripe Withdrawal Monitoring Guide

## 📊 **Stripe Dashboard Monitoring**

### **1. Access Your Stripe Dashboard**
- **URL:** https://dashboard.stripe.com
- **Mode:** Make sure you're in **Test Mode** (toggle in top-left)
- **Login:** Use your Stripe account credentials

### **2. Key Dashboard Sections**

#### **A. Payouts Section**
- **Path:** `Payouts` in left sidebar
- **What you'll see:**
  - All withdrawal attempts
  - Status: `pending`, `paid`, `failed`, `canceled`
  - Amount in dollars
  - Destination bank account (last 4 digits)
  - Created and arrival dates

#### **B. Balance Section**
- **Path:** `Balance` in left sidebar
- **What you'll see:**
  - Available balance
  - Pending payouts
  - Recent transactions

#### **C. Events Section**
- **Path:** `Events` in left sidebar
- **What you'll see:**
  - Real-time activity logs
  - Payout status changes
  - Error events

### **3. Understanding Payout Statuses**

| Status | Meaning | What to Do |
|--------|---------|------------|
| `pending` | Payout created, processing | Wait for processing |
| `paid` | Successfully sent to bank | ✅ Success! |
| `failed` | Payout failed | Check error details |
| `canceled` | Payout was canceled | Check why it was canceled |

### **4. Real-Time Monitoring**

#### **A. Backend Logs**
When you make a withdrawal, check your backend console for:
```
✅ Real Stripe payout created: {
  payoutId: 'po_1234567890',
  amount: 20,
  status: 'pending',
  destination: 'btok_1234567890',
  arrivalDate: 1640995200
}

🔗 View payout in Stripe Dashboard:
   https://dashboard.stripe.com/test/payouts/po_1234567890
   Or go to: https://dashboard.stripe.com/test/payouts
```

#### **B. Check Recent Payouts Script**
Run this command to see recent payouts:
```bash
cd Gamingappbackend
node check-stripe-payouts.js
```

### **5. Testing Workflow**

#### **Step 1: Make a Test Withdrawal**
1. Go to your frontend: Profile > Wallet > Withdraw Funds > Bank Cards
2. Enter test data:
   - Amount: $20
   - Account Holder: Test User
   - Routing Number: 110000000
   - Account Number: 000123456789
3. Click "Withdraw via Bank Transfer"

#### **Step 2: Check Backend Logs**
Look for the payout creation logs in your backend console.

#### **Step 3: Check Stripe Dashboard**
1. Go to https://dashboard.stripe.com/test/payouts
2. Look for your payout with the amount you withdrew
3. Check the status and details

#### **Step 4: Monitor Status Changes**
- **Pending:** Payout is being processed
- **Paid:** Money has been sent to the bank account
- **Failed:** Check error details for troubleshooting

### **6. Troubleshooting**

#### **If Payout Shows as "Failed":**
1. Check the error message in Stripe dashboard
2. Verify bank account details are correct
3. Check if your Stripe account has sufficient balance
4. Ensure you're using valid test bank details

#### **If Payout is "Pending" for Too Long:**
- In test mode, payouts may take longer to process
- Check Stripe's status page for any service issues
- Verify your Stripe account is properly configured

### **7. Test Bank Details**

For testing, use these Stripe test bank details:
- **Routing Number:** 110000000
- **Account Number:** 000123456789
- **Account Holder:** Test User

### **8. Production Considerations**

When moving to production:
1. **Enable Live Mode** in Stripe dashboard
2. **Use real bank account details**
3. **Set up webhooks** for real-time notifications
4. **Monitor payout failures** and implement retry logic
5. **Set up alerts** for failed payouts

### **9. Useful Commands**

```bash
# Check recent payouts
node check-stripe-payouts.js

# Test Stripe connection
node test-stripe-withdrawal-simple.js

# Check withdrawal results in database
node check-withdrawal-results.js
```

### **10. Dashboard URLs**

- **All Payouts:** https://dashboard.stripe.com/test/payouts
- **Balance:** https://dashboard.stripe.com/test/balance
- **Events:** https://dashboard.stripe.com/test/events
- **Settings:** https://dashboard.stripe.com/test/settings

---

## 🎯 **Quick Test Checklist**

- [ ] Made test withdrawal from frontend
- [ ] Checked backend logs for payout creation
- [ ] Verified payout appears in Stripe dashboard
- [ ] Monitored status changes
- [ ] Confirmed wallet balance was deducted
- [ ] Checked transaction history

---

**Need Help?** Check the Stripe documentation or contact Stripe support for account-specific issues.
