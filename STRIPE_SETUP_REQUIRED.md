# Stripe Connect Setup Required

## Current Status

The Stripe Connect integration code is complete, but requires Stripe API credentials to be configured in your Supabase project.

## What You're Seeing

When clicking "Connect with Stripe", you see "Connecting to Stripe..." but nothing happens. This is because the edge function cannot communicate with Stripe without API credentials.

## What's Needed

### 1. Create Stripe Account

If you don't have one already:
1. Go to https://stripe.com
2. Click "Sign up"
3. Complete the registration

### 2. Get Stripe API Keys

1. Log in to Stripe Dashboard: https://dashboard.stripe.com
2. Click "Developers" in left sidebar
3. Click "API keys"
4. Copy your **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for production)

**Important:** Use TEST keys while testing, then switch to LIVE keys for production.

### 3. Configure Supabase Environment Variables

You need to add the Stripe secret key to your Supabase project:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Select your project
3. Go to **Settings** → **Edge Functions**
4. Click **Add new secret**
5. Add these secrets:

```
Name: STRIPE_SECRET_KEY
Value: sk_test_... (your Stripe secret key)

Name: SITE_URL
Value: https://yourdomain.com (or http://localhost:5173 for local dev)
```

#### Option B: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Set the Stripe secret key
supabase secrets set STRIPE_SECRET_KEY=sk_test_...

# Set your site URL
supabase secrets set SITE_URL=https://yourdomain.com

# Redeploy the edge function
supabase functions deploy connect-stripe
```

### 4. Deploy the Edge Function

The `connect-stripe` edge function must be deployed to your Supabase project:

```bash
supabase functions deploy connect-stripe
```

Or deploy all functions:

```bash
supabase functions deploy
```

### 5. Test the Connection

After configuring the environment variables:

1. Go to **Membership** → **Payment Settings**
2. Click **Connect with Stripe**
3. You should be redirected to Stripe's onboarding page
4. Complete the onboarding (use test data if in test mode)
5. You'll be redirected back with "✓ Connected" status

## Test Mode vs Live Mode

### Test Mode (Development)

Use test API keys (start with `sk_test_`):
- No real money involved
- Use test card numbers
- Test the entire flow safely

**Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Use any future expiry date and any CVC

### Live Mode (Production)

Use live API keys (start with `sk_live_`):
- Real money transactions
- Real bank account required
- Must complete full Stripe verification

**Before going live:**
1. Complete Stripe account verification
2. Add bank account for payouts
3. Switch to live API keys
4. Test thoroughly in live mode
5. Enable webhooks (see below)

## Setting Up Webhooks

For payments to work correctly, you need to configure a webhook:

### 1. Get Your Webhook Endpoint URL

Your webhook URL is:
```
https://YOUR-PROJECT-ID.supabase.co/functions/v1/stripe-webhook
```

Replace `YOUR-PROJECT-ID` with your actual Supabase project ID.

### 2. Configure in Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Enter your webhook URL
4. Select events to listen to:
   - `checkout.session.completed`
5. Click **Add endpoint**

### 3. Get Webhook Secret

1. Click on the webhook you just created
2. In the **Signing secret** section, click **Reveal**
3. Copy the secret (starts with `whsec_`)

### 4. Add to Supabase

Add the webhook secret to your Supabase environment:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Or via Supabase Dashboard:
- Settings → Edge Functions → Add new secret
- Name: `STRIPE_WEBHOOK_SECRET`
- Value: `whsec_...`

## Troubleshooting

### "Connecting to Stripe..." hangs

**Cause:** Environment variables not set

**Solution:**
1. Check Supabase Dashboard → Settings → Edge Functions
2. Verify `STRIPE_SECRET_KEY` is set
3. Redeploy the edge function

### "Failed to connect to Stripe"

**Cause:** Invalid API key or network issue

**Solution:**
1. Verify the API key is correct
2. Check it's the SECRET key (not publishable key)
3. Ensure edge function is deployed
4. Check Supabase function logs for details

### Connection works but payments fail

**Cause:** Webhook not configured

**Solution:**
1. Set up webhook in Stripe Dashboard
2. Add `STRIPE_WEBHOOK_SECRET` to Supabase
3. Redeploy `stripe-webhook` function

### "You must be a club admin"

**Cause:** User doesn't have admin role

**Solution:**
- Only club admins can connect Stripe
- Check user's role in `user_clubs` table
- Grant admin role if needed

## Checking Logs

To see what's happening:

### Edge Function Logs

1. Go to Supabase Dashboard
2. Select your project
3. Go to **Edge Functions** → **Logs**
4. Filter by function name: `connect-stripe`
5. Look for errors or status messages

### Stripe Logs

1. Go to Stripe Dashboard
2. Click **Developers** → **Events**
3. See all API requests and webhooks
4. Filter by object type or status

## Security Notes

### API Key Security

- **Never** commit API keys to Git
- Use test keys for development
- Rotate keys if compromised
- Restrict key permissions in Stripe Dashboard

### Webhook Security

- Always verify webhook signatures
- Use HTTPS only (enforced by Stripe)
- Keep webhook secret secure
- Monitor webhook logs for suspicious activity

### Access Control

- Only admins can connect Stripe
- User authentication required
- RLS policies protect club data
- Service role used only for database updates

## Quick Start Checklist

For the fastest setup:

- [ ] Create Stripe account
- [ ] Get API keys (test mode)
- [ ] Add `STRIPE_SECRET_KEY` to Supabase
- [ ] Add `SITE_URL` to Supabase
- [ ] Deploy `connect-stripe` function
- [ ] Test connection on Payment Settings page
- [ ] Complete Stripe onboarding
- [ ] Set up webhook
- [ ] Add `STRIPE_WEBHOOK_SECRET` to Supabase
- [ ] Deploy `stripe-webhook` function
- [ ] Test a payment with test card
- [ ] Verify transaction appears in Finances

## Production Checklist

Before launching:

- [ ] Switch to live Stripe API keys
- [ ] Complete Stripe account verification
- [ ] Add bank account for payouts
- [ ] Set up production webhook
- [ ] Update `SITE_URL` to production URL
- [ ] Enable 2FA on Stripe account
- [ ] Test complete payment flow
- [ ] Monitor first few transactions
- [ ] Review payout schedule
- [ ] Set up email notifications

## Need Help?

### Common Questions

**Q: Do I need to create multiple Stripe accounts for multiple clubs?**
A: No! Each club connects their own Stripe account through Stripe Connect. Your platform just facilitates the connection.

**Q: How do clubs get paid?**
A: Money goes directly to their connected Stripe account, then to their bank account based on their payout schedule.

**Q: What about fees?**
A: Standard Stripe fees apply (1.75% + $0.30 AUD). These are deducted automatically.

**Q: Can clubs disconnect later?**
A: Yes, they can disconnect from their Stripe Dashboard or you can add a disconnect feature.

### Still Stuck?

1. Check Supabase function logs
2. Check Stripe Dashboard events
3. Verify all environment variables are set
4. Ensure functions are deployed
5. Test with Stripe test mode first

## Summary

✅ **Code is ready** - Integration is fully implemented
⚠️ **Configuration needed** - Requires Stripe API keys
🔧 **Setup steps** - Follow this guide to configure
✨ **Result** - Clubs can accept online payments!

The integration will work once you:
1. Add Stripe API key to Supabase
2. Deploy the edge functions
3. Complete Stripe onboarding

Everything else is ready to go! 🚀
