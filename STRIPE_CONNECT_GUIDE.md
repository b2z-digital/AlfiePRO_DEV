# Stripe Connect Setup Guide - Platform Configuration

## ⚡ Quick Understanding

**Your system IS set up correctly for Stripe Connect!** Each club will connect their OWN Stripe account. You just need to configure YOUR platform's Stripe credentials once, then ALL clubs can connect.

### How It Works (Like WooCommerce)

```
┌─────────────────────────────────────────────────────────┐
│ YOUR PLATFORM (One-time setup)                          │
│ - Create Stripe account                                 │
│ - Get API keys                                           │
│ - Configure once                                         │
└─────────────────────────────────────────────────────────┘
                         │
                         │ Facilitates connections
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌────────┐       ┌────────┐      ┌────────┐
   │ Club 1 │       │ Club 2 │      │ Club 3 │
   │ Stripe │       │ Stripe │      │ Stripe │
   └────────┘       └────────┘      └────────┘
   Their own        Their own        Their own
   account          account          account
```

**Important:**
- Clubs don't need to give you their API keys
- Clubs manage their own Stripe dashboard
- Money goes directly to their accounts
- You just facilitate the connection

## 🚀 Setup Steps (5 Minutes)

### Step 1: Create YOUR Platform Stripe Account

1. Go to https://stripe.com
2. Click "Sign up"
3. Choose "Start now" (Business account)
4. Complete registration with your business details

**Use your business details** (your platform/company), not a club's details.

### Step 2: Get YOUR API Keys

1. Log in to https://dashboard.stripe.com
2. Click **Developers** → **API keys**

**RECOMMENDED: Use a Restricted Key for Better Security** 🔐

Instead of using the full Secret key, create a **Restricted API key** with only the permissions you need:

1. Scroll to **"Restricted keys"** section
2. Click **"+ Create restricted key"**
3. Name it: "Yacht Club Platform - Test"
4. Set these permissions to **Write**:
   - Accounts
   - Account Links
   - Checkout Sessions
5. Set **OAuth** to **Full access**
6. Leave everything else as **None**
7. Click **"Create key"**
8. **Copy the restricted key** (starts with `rk_test_`)

**Alternative: Use Standard Secret Key**

If you prefer, you can use the standard Secret key (starts with `sk_test_`), but the Restricted key is more secure.

**Note:** Start with TEST mode keys. Switch to LIVE mode later.

**See detailed guide:** [Stripe Restricted Key Setup](./STRIPE_RESTRICTED_KEY_SETUP.md)

### Step 3: Configure Supabase Environment Variables

You need to add YOUR Stripe secret key to Supabase:

#### Using Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Settings** (left sidebar)
3. Click **Edge Functions**
4. Scroll to **Secrets** section
5. Click **Add new secret**

Add these TWO secrets:

**Secret 1:**
```
Name: STRIPE_SECRET_KEY
Value: rk_test_... (restricted key) or sk_test_... (secret key)
```

**Secret 2:**
```
Name: SITE_URL
Value: https://yourdomain.com
(or http://localhost:5173 for local development)
```

Click **Save** for each.

### Step 4: Deploy the Edge Function

The function needs to be deployed to Supabase. You have two options:

#### Option A: Using the MCP Tool (Recommended)

Since you have the Supabase MCP available, you can deploy directly:

The function at `/supabase/functions/connect-stripe/index.ts` is ready to deploy.

#### Option B: Using Supabase CLI

If you have Supabase CLI installed:

```bash
supabase functions deploy connect-stripe
```

### Step 5: Test the Connection

1. **Refresh your app** (to pick up the new configuration)
2. Go to **Membership** → **Payment Settings**
3. Click **"Connect with Stripe"**
4. You should now be redirected to **Stripe's onboarding page**
5. Complete the onboarding (use test data in test mode)
6. You'll be redirected back with "✓ Connected"

## 🧪 Test Mode vs Live Mode

### Test Mode (Start Here)

Use **TEST** API keys (start with `sk_test_`):
- No real money
- Use test credit cards
- Test the entire flow
- Perfect for development

**Test Credit Card:**
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

### Live Mode (Production)

Switch to **LIVE** API keys (start with `sk_live_`) when ready:
- Real money transactions
- Complete Stripe account verification
- Add real bank account
- Test thoroughly before launch

**To switch to live mode:**
1. In Stripe Dashboard, toggle from "Test mode" to "Live mode" (top right)
2. Get the LIVE secret key
3. Update `STRIPE_SECRET_KEY` in Supabase with live key
4. Redeploy the function

## ✅ What Happens When a Club Connects

### The Flow:

1. **Club admin clicks** "Connect with Stripe"
2. **System creates** a Stripe Connect account
3. **Redirects to Stripe** onboarding page
4. **Club logs in/signs up** to Stripe (their account)
5. **Club completes** business information
6. **Club adds** bank account details
7. **Stripe redirects** back to your app
8. **Status shows** "✓ Connected"

### What Gets Stored:

In your database (`clubs` table):
- `stripe_account_id` - The club's Stripe account ID
- `stripe_enabled` - Boolean flag

**That's it!** No API keys, no sensitive data stored.

### Where Money Goes:

```
Customer pays $100 membership fee
         ↓
Stripe processes payment
         ↓
Stripe fees: $1.75 + $0.30 = $2.05
         ↓
Club receives: $97.95
         ↓
Goes directly to club's bank account
```

You don't handle any money - it goes straight to the club.

## 🎯 Account Types

Your system uses **Stripe Standard Connect**:

### Standard Accounts (What You're Using) ✅

**Pros:**
- Club has full control of their Stripe account
- Club can log into Stripe directly
- Club manages their own payouts
- Club handles their own tax/compliance
- Most flexible option

**For Clubs:**
- Create their own Stripe login
- Manage disputes/refunds
- See all transactions
- Configure payout schedule
- Full Stripe Dashboard access

**Perfect for:** Yacht clubs managing their own finances independently

## 🔧 Troubleshooting

### "You did not provide an API key" Error

**This means:** Supabase environment variables not set

**Fix:**
1. Go to Supabase Dashboard → Settings → Edge Functions
2. Check if `STRIPE_SECRET_KEY` is listed
3. If not, add it following Step 3 above
4. Redeploy the function

### "Connecting..." hangs forever

**This means:** Edge function not deployed or can't reach Stripe

**Fix:**
1. Check Supabase function logs (Edge Functions → Logs)
2. Verify `STRIPE_SECRET_KEY` is set
3. Redeploy the function
4. Check your internet connection

### "You must be a club admin"

**This means:** User doesn't have admin permissions

**Fix:**
- Only club admins can connect Stripe
- Check `user_clubs` table, verify `role = 'admin'`
- Grant admin role if needed

### Connection works but shows "Not Connected"

**This means:** Database update might have failed

**Fix:**
1. Check `clubs` table
2. Look for `stripe_account_id` field
3. Check Supabase logs for errors
4. Try connecting again

## 🔐 Security

### Your Platform:

**You Control:**
- Your Stripe API keys (secret key)
- Connection facilitation
- Which clubs can connect

**You DON'T Get:**
- Club's Stripe login credentials
- Club's API keys
- Access to club's money
- Club's bank account details

### Each Club:

**Clubs Control:**
- Their own Stripe account
- Their own bank account
- Their own payouts
- Their own customer data

**Clubs DON'T Share:**
- Their Stripe login
- Their API keys
- Their bank account access

### Best Practices:

- ✅ Use test mode for development
- ✅ Rotate API keys if compromised
- ✅ Use HTTPS only (enforced)
- ✅ Monitor Stripe webhook events
- ✅ Enable 2FA on your Stripe account
- ❌ Never commit API keys to Git
- ❌ Never share secret keys
- ❌ Never log full API keys

## 📊 Managing Connected Clubs

### View Connected Clubs:

In your database:
```sql
SELECT id, name, stripe_account_id, stripe_enabled
FROM clubs
WHERE stripe_enabled = true;
```

### Disconnect a Club:

If needed (shouldn't normally be necessary):

1. Club can disconnect from their Stripe Dashboard
2. Or update your database:
```sql
UPDATE clubs
SET stripe_account_id = NULL,
    stripe_enabled = false
WHERE id = 'club-id';
```

### Check Connection Status:

Query Stripe API for account status:
```javascript
const account = await stripe.accounts.retrieve(
  club.stripe_account_id
);
console.log(account.charges_enabled); // Can process payments?
console.log(account.payouts_enabled); // Can receive payouts?
```

## 💰 Stripe Fees

Standard Stripe pricing applies to each club:

**Australia:**
- 1.75% + $0.30 AUD per successful charge

**Clubs pay these fees** from their account, not you.

**Example:**
- $100 membership payment
- Stripe fee: $2.05
- Club receives: $97.95

## 📋 Production Checklist

Before going live:

### Your Platform:
- [ ] Create live Stripe account
- [ ] Complete business verification
- [ ] Get live API keys
- [ ] Update `STRIPE_SECRET_KEY` to live key
- [ ] Update `SITE_URL` to production URL
- [ ] Deploy edge functions with live config
- [ ] Enable 2FA on Stripe account
- [ ] Set up webhook endpoints
- [ ] Test with real card (refund after)
- [ ] Monitor first few connections

### For Each Club:
- [ ] Club clicks "Connect with Stripe"
- [ ] Club completes Stripe onboarding
- [ ] Club adds bank account
- [ ] Club verifies bank account
- [ ] Club tests payment with test card
- [ ] Club configures payout schedule
- [ ] Club reviews Stripe dashboard
- [ ] Club enables payment on membership forms

## 🎓 Resources

### Stripe Documentation:
- [Stripe Connect Overview](https://stripe.com/docs/connect)
- [Standard Accounts](https://stripe.com/docs/connect/standard-accounts)
- [Testing Connect](https://stripe.com/docs/connect/testing)

### Your Documentation:
- [Complete Setup Guide](./STRIPE_SETUP_REQUIRED.md)
- [Troubleshooting Finance Integration](./TROUBLESHOOTING_FINANCE_INTEGRATION.md)

## ❓ FAQs

**Q: Do I need a business bank account?**
A: You need A Stripe account, but clubs connect their own accounts. Each club needs their own bank account.

**Q: How many clubs can connect?**
A: Unlimited! Each club connects their own Stripe account.

**Q: What if a club doesn't have a Stripe account?**
A: They create one during the connection process. Takes 5-10 minutes.

**Q: Can clubs disconnect and reconnect?**
A: Yes, they can reconnect anytime by clicking "Connect with Stripe" again.

**Q: What about refunds?**
A: Clubs handle refunds through their Stripe dashboard.

**Q: Do clubs see a "powered by" logo?**
A: No, with Standard accounts, it's completely their Stripe account.

**Q: What about international clubs?**
A: Stripe is available in 45+ countries. Set the country code during account creation.

**Q: Can I charge platform fees?**
A: Yes! You can use Application Fees in Stripe Connect, but this requires configuration.

## 🎉 Summary

**What You Need To Do ONCE:**
1. Create YOUR Stripe account (5 minutes)
2. Add YOUR secret key to Supabase (2 minutes)
3. Deploy the edge function (1 minute)

**What Each Club Does:**
1. Click "Connect with Stripe" (1 click)
2. Log into Stripe (1 minute)
3. Complete onboarding (5 minutes)
4. Done! ✅

**Result:**
- Clubs can accept credit card payments
- Money goes directly to their account
- You facilitate the connection
- Zero ongoing maintenance
- Fully secure and compliant

Your code is perfect - just needs the one-time platform configuration! 🚀
