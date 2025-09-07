// Use official Checkout Server SDK for Orders/Capture/Verify
const paypal = require('@paypal/checkout-server-sdk');

class PayPalService {
  constructor() {
    // Initialize PayPal client with your actual credentials
    const clientId = process.env.Paypal_Client_ID;
    const clientSecret = process.env.Paypal_Secret_Key;
    
    if (!clientId || !clientSecret) {
      console.error('❌ PayPal credentials not found in environment variables');
      throw new Error('PayPal credentials not configured');
    }
    
    // Choose environment
    const isLive = (process.env.PAYPAL_ENV || '').toLowerCase() === 'live' || process.env.NODE_ENV === 'production';
    const env = isLive
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(env);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    
    console.log(`✅ PayPal service initialized with ${isLive ? 'live' : 'sandbox'} environment`);
  }
  
  // Create a PayPal order
  async createOrder(amount, description, customId) {
    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: customId,
          invoice_id: customId,
          description: description,
          amount: {
            currency_code: 'USD',
            value: amount.toString()
          }
        }],
        application_context: {
          return_url: `${process.env.FRONTEND_URL}/profile?success=true`,
          cancel_url: `${process.env.FRONTEND_URL}/profile?canceled=true`
        }
      });
      
      const order = await this.client.execute(request);
      console.log('✅ PayPal order created:', order.result.id);
      
      return {
        success: true,
        orderId: order.result.id,
        approvalUrl: order.result.links.find(link => link.rel === 'approve').href
      };
    } catch (error) {
      console.error('❌ Error creating PayPal order:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Capture a PayPal payment
  async capturePayment(orderId) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});
      
      const capture = await this.client.execute(request);
      console.log('✅ PayPal payment captured:', capture.result.id);
      
      return {
        success: true,
        captureId: capture.result.id,
        status: capture.result.status,
        amount: capture.result.purchase_units[0].payments.captures[0].amount.value,
        currency: capture.result.purchase_units[0].payments.captures[0].amount.currency_code
      };
    } catch (error) {
      console.error('❌ Error capturing PayPal payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Verify a PayPal payment
  async verifyPayment(orderId) {
    try {
      const request = new paypal.orders.OrdersGetRequest(orderId);
      const order = await this.client.execute(request);
      
      if (order.result.status === 'COMPLETED') {
        return {
          success: true,
          status: order.result.status,
          amount: order.result.purchase_units[0].payments.captures[0].amount.value,
          currency: order.result.purchase_units[0].payments.captures[0].amount.currency_code
        };
      }
      
      return {
        success: false,
        status: order.result.status,
        message: 'Payment not completed'
      };
    } catch (error) {
      console.error('❌ Error verifying PayPal payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Internal: get OAuth access token for REST calls (used for payouts)
  async getAccessToken() {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get PayPal access token: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data.access_token;
  }

  // Process PayPal payout (for withdrawals) via REST API
  async processPayout(amount, email, description) {
    try {
      const token = await this.getAccessToken();
      const res = await fetch(`${this.baseUrl}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: `payout_${Date.now()}`,
            email_subject: 'Your withdrawal has been processed'
          },
          items: [{
            recipient_type: 'EMAIL',
            amount: { value: amount.toString(), currency: 'USD' },
            receiver: email,
            note: description,
            sender_item_id: `item_${Date.now()}`
          }]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`PayPal payout failed: ${res.status} ${JSON.stringify(data)}`);
      }
      const payoutId = data?.batch_header?.payout_batch_id || data?.batch_header?.payout_batch_id;
      console.log('✅ PayPal payout processed:', payoutId || 'unknown');
      return { success: true, payoutId: payoutId || 'unknown', status: data?.batch_header?.batch_status || 'unknown' };
    } catch (error) {
      console.error('❌ Error processing PayPal payout:', error);
      return { success: false, error: error.message };
    }
  }

  // Get PayPal account balances (platform/business account)
  async getBalances(fullRange = false) {
    try {
      const token = await this.getAccessToken();
      const balancesRes = await fetch(`${this.baseUrl}/v1/reporting/balances`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (balancesRes.ok) {
        const data = await balancesRes.json();
        return { success: true, data };
      }

      // If unauthorized, fall back to transactions API to compute balance
      let errorPayload;
      try { errorPayload = await balancesRes.json(); } catch (_) { errorPayload = {}; }
      if (balancesRes.status === 403) {
        console.warn('Balances API not authorized. Falling back to transactions API.');

        const dayMs = 24 * 60 * 60 * 1000;
        const now = new Date();
        const rangeDays = fullRange ? 1095 : 30; // up to ~3 years if requested
        const startOverall = new Date(now.getTime() - rangeDays * dayMs);

        let totalComputed = 0;
        let currency = 'USD';

        // Iterate in 30/31-day windows (API limit ~31 days per request)
        let windowStart = startOverall;
        while (windowStart < now) {
          const windowEnd = new Date(Math.min(windowStart.getTime() + 30 * dayMs, now.getTime()));

          // Basic paging loop (best-effort)
          let page = 1;
          while (true) {
            const params = new URLSearchParams({
              start_date: windowStart.toISOString(),
              end_date: windowEnd.toISOString(),
              page_size: '500',
              page: String(page)
            });
            const txRes = await fetch(`${this.baseUrl}/v1/reporting/transactions?${params.toString()}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            });
            if (!txRes.ok) {
              const txErr = await txRes.text();
              throw new Error(`Failed to fetch PayPal transactions: ${txRes.status} ${txErr}`);
            }
            const txData = await txRes.json();
            const transactions = Array.isArray(txData?.transaction_details) ? txData.transaction_details : [];

            if (transactions.length === 0) break;

            for (const tx of transactions) {
              const info = tx?.transaction_info || {};
              const amtObj = info?.transaction_amount || {};
              const val = parseFloat(amtObj?.value || '0');
              if (!Number.isNaN(val)) totalComputed += val;
              if (amtObj?.currency_code) currency = amtObj.currency_code;
            }

            // If fewer than page_size returned, we've reached the end of this window
            if (transactions.length < 500) break;
            page += 1;
            if (page > 10) break; // safety guard
          }

          // Advance window
          windowStart = new Date(windowEnd.getTime() + 1000);
        }

        return {
          success: true,
          data: {
            computedBalance: Number(totalComputed.toFixed(2)),
            currency,
            source: 'computed_from_transactions',
            start_date: startOverall.toISOString(),
            end_date: now.toISOString(),
            fullRange
          }
        };
      }

      throw new Error(`Failed to fetch PayPal balances: ${balancesRes.status} ${JSON.stringify(errorPayload)}`);
    } catch (error) {
      console.error('❌ Error fetching PayPal balances:', error);
      return { success: false, error: error.message };
    }
  }

  // Diagnostics: probe key endpoints to understand permissions quickly
  async diagnose() {
    const result = {
      environment: this.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
      probes: {}
    };

    try {
      const token = await this.getAccessToken();
      const commonHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      // Probe balances
      try {
        const res = await fetch(`${this.baseUrl}/v1/reporting/balances`, { headers: commonHeaders });
        result.probes.balances = { status: res.status };
        try { result.probes.balances.body = await res.json(); } catch (_) {}
      } catch (e) {
        result.probes.balances = { error: e.message };
      }

      // Probe transactions (small window)
      try {
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const params = new URLSearchParams({ start_date: start.toISOString(), end_date: now.toISOString(), page_size: '1' });
        const res = await fetch(`${this.baseUrl}/v1/reporting/transactions?${params.toString()}`, { headers: commonHeaders });
        result.probes.transactions = { status: res.status };
        try { result.probes.transactions.body = await res.json(); } catch (_) {}
      } catch (e) {
        result.probes.transactions = { error: e.message };
      }

      // Probe webhooks events (read-only)
      try {
        const res = await fetch(`${this.baseUrl}/v1/notifications/webhooks-events?page_size=1`, { headers: commonHeaders });
        result.probes.webhooksEvents = { status: res.status };
        try { result.probes.webhooksEvents.body = await res.json(); } catch (_) {}
      } catch (e) {
        result.probes.webhooksEvents = { error: e.message };
      }

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { PayPalService };
