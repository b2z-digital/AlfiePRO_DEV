# Stripe Restricted API Key Setup Guide

## ✅ YES - Use a Restricted Key! (Recommended)

Using a **Restricted API key** instead of the full Secret key is **BEST PRACTICE** for security. This limits what the key can do, following the principle of least privilege.

## 🔐 Why Restricted Keys Are Better

### Security Benefits:
- ✅ **Limits blast radius** - If key is compromised, attacker has limited access
- ✅ **Principle of least privilege** - Key only has permissions it needs
- ✅ **Better audit trail** - Know exactly what each key can do
- ✅ **Compliance friendly** - Meets security best practices
- ✅ **IP restrictions** - Can limit to Supabase IP ranges

### What Can Go Wrong with Full Secret Keys:
- ❌ Full access to all Stripe resources
- ❌ Can delete data, issue refunds, access customer data
- ❌ Can modify subscription plans, pricing
- ❌ Higher risk if accidentally exposed

## 📋 Required Permissions for Your Platform

Your system uses these Stripe APIs:

### 1. Stripe Connect (connect-stripe function)
- **Create Connected Accounts** - `stripe.accounts.create()`
- **Create Account Links** - `stripe.accountLinks.create()`
- **OAuth Token Exchange** - `stripe.oauth.token()`

### 2. Checkout Sessions (create-stripe-checkout function)
- **Create Checkout Sessions** - `stripe.checkout.sessions.create()`
- **On Connected Accounts** - Uses `stripeAccount` parameter

### 3. Webhooks (stripe-webhook function)
- **Read Events** - `stripe.webhooks.constructEvent()`
- No write permissions needed

## 🎯 Step-by-Step: Create Restricted Key

### Step 1: Go to Stripe Dashboard

1. Log in to https://dashboard.stripe.com
2. Click **Developers** → **API keys**
3. Scroll to **Restricted keys** section
4. Click **"+ Create restricted key"**

### Step 2: Name Your Key

```
Name: Yacht Club Platform - Production
(or "... - Test" for test mode)
```

### Step 3: Set Permissions

**IMPORTANT:** Enable these EXACT permissions:

#### Core Resources (All set to "Write"):

```
✅ Accounts - Write
   └ Needed to create connected accounts for clubs

✅ Account Links - Write
   └ Needed to create onboarding links

✅ Checkout Sessions - Write
   └ Needed to create payment sessions for memberships
```

#### OAuth Permissions:

```
✅ OAuth - Full access
   └ Needed for Stripe Connect authorization flow
```

#### Webhook Permissions (if using webhooks):

```
✅ Webhook Endpoints - Read
   └ Needed to verify webhook signatures
```

#### Everything Else:

```
❌ Leave all other permissions as "None"
```

### Step 4: IP Restrictions (Optional but Recommended)

If you want to restrict to Supabase IPs only:

**Note:** Supabase Edge Functions use dynamic IPs, so IP restrictions may not be practical. Skip this for now unless you have specific security requirements.

If you do want IP restrictions:
1. Contact Supabase support for their IP ranges
2. Add those IP ranges in the "IP address restrictions" section

### Step 5: Copy the Key

1. Click **"Create key"**
2. **Copy the key immediately** (starts with `rk_live_` or `rk_test_`)
3. Store it securely - you won't see it again!

### Step 6: Add to Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Edge Functions**
3. Scroll to **Secrets** section
4. Find existing `STRIPE_SECRET_KEY` or create new
5. **Replace** the value with your restricted key: `rk_test_...`
6. Click **Save**

### Step 7: Test It

1. Redeploy your edge functions (if needed)
2. Go to your app: **Membership** → **Payment Settings**
3. Click **"Connect with Stripe"**
4. Should redirect to Stripe onboarding
5. Complete test onboarding
6. Confirm "✓ Connected" status

## 📊 Permissions Summary

Here's a quick reference of what your restricted key needs:

| Stripe Resource | Permission Level | Why Needed |
|----------------|------------------|------------|
| **Accounts** | Write | Create connected accounts for clubs |
| **Account Links** | Write | Generate onboarding URLs |
| **OAuth** | Full Access | Exchange authorization codes |
| **Checkout Sessions** | Write | Create payment sessions |
| **Webhook Endpoints** | Read | Verify webhook signatures (optional) |
| **Everything Else** | None | Not used by your platform |

## 🧪 Test Mode vs Live Mode Keys

### For Development (Test Mode):

1. In Stripe Dashboard, ensure **"Test mode"** toggle is ON (top right)
2. Create restricted key following steps above
3. Key will start with `rk_test_`
4. Add to Supabase as `STRIPE_SECRET_KEY`

**Test key characteristics:**
- Only works in test mode
- No real money
- Use test cards (4242 4242 4242 4242)
- Can test full flow safely

### For Production (Live Mode):

1. In Stripe Dashboard, toggle **"Test mode"** to OFF
2. Complete business verification first
3. Create restricted key with SAME permissions
4. Key will start with `rk_live_`
5. Replace test key with live key in Supabase

**Live key characteristics:**
- Real money transactions
- Requires verified Stripe account
- Must have business details complete
- Stripe will review your business

## 🔄 Migrating from Secret Key to Restricted Key

If you already have a full secret key configured:

### Step 1: Create Restricted Key
Follow the steps above to create restricted key with proper permissions

### Step 2: Update Supabase
1. Go to Supabase Dashboard → Settings → Edge Functions
2. Find `STRIPE_SECRET_KEY` in secrets list
3. Click to edit
4. Replace value with new restricted key `rk_test_...`
5. Save

### Step 3: Test Thoroughly
1. Test connecting a club's Stripe account
2. Test creating a checkout session
3. Test webhook delivery (if applicable)
4. Check Supabase function logs for errors

### Step 4: Rotate Old Key (Optional)
1. Go to Stripe Dashboard → Developers → API keys
2. Find the old secret key
3. Click "..." menu → "Roll key" or "Delete"
4. Confirm - old key will stop working

## 🚨 Troubleshooting Restricted Keys

### "Insufficient permissions" Error

**Cause:** Restricted key doesn't have required permissions

**Fix:**
1. Go to Stripe Dashboard → Developers → API keys
2. Find your restricted key
3. Click to edit permissions
4. Ensure all required permissions are "Write" (see Step 3 above)
5. Save changes

### "Invalid API key" Error

**Cause:** Key not configured in Supabase or typo

**Fix:**
1. Verify key is correctly copied (starts with `rk_test_` or `rk_live_`)
2. Check for extra spaces before/after key
3. Ensure key is added to correct Supabase environment
4. Redeploy edge functions after changing secrets

### "Account creation failed"

**Cause:** Missing "Accounts - Write" permission

**Fix:**
1. Edit restricted key in Stripe Dashboard
2. Set **Accounts** permission to **Write**
3. Save and test again

### "OAuth token exchange failed"

**Cause:** Missing OAuth permissions

**Fix:**
1. Edit restricted key in Stripe Dashboard
2. Set **OAuth** permission to **Full access**
3. Save and test again

### Works in Test Mode but not Live Mode

**Cause:** Using test restricted key in live mode (or vice versa)

**Fix:**
1. Check Stripe Dashboard mode (Test vs Live)
2. Create restricted key in correct mode
3. Update Supabase with correct key
4. Ensure app is in correct mode

## 🔐 Security Best Practices

### DO:
- ✅ Use restricted keys for all integrations
- ✅ Create separate keys for dev, staging, production
- ✅ Rotate keys every 90 days
- ✅ Use test keys for development
- ✅ Enable 2FA on your Stripe account
- ✅ Monitor key usage in Stripe Dashboard
- ✅ Delete unused keys immediately

### DON'T:
- ❌ Use secret keys when restricted keys work
- ❌ Give keys more permissions than needed
- ❌ Share keys between environments
- ❌ Commit keys to version control
- ❌ Log full keys in application logs
- ❌ Use live keys for testing
- ❌ Keep old keys active after rotating

## 📈 Monitoring Your Restricted Key

### Check Usage:
1. Go to Stripe Dashboard
2. Click **Developers** → **API keys**
3. Find your restricted key
4. View **"Last used"** timestamp
5. Click key to see usage details

### What to Monitor:
- Last used timestamp (should be recent if active)
- Number of requests per day
- Any permission errors in logs
- Unusual activity patterns

### Set Up Alerts:
1. Stripe Dashboard → **Settings** → **Notifications**
2. Enable "API failures" alerts
3. Add your email
4. You'll be notified of any issues

## ✅ Verification Checklist

After setting up your restricted key:

- [ ] Key created with correct name
- [ ] **Accounts** permission set to **Write**
- [ ] **Account Links** permission set to **Write**
- [ ] **OAuth** permission set to **Full access**
- [ ] **Checkout Sessions** permission set to **Write**
- [ ] All other permissions set to **None**
- [ ] Key copied and stored securely
- [ ] Added to Supabase as `STRIPE_SECRET_KEY`
- [ ] Edge functions redeployed (if needed)
- [ ] Tested: Click "Connect with Stripe" works
- [ ] Tested: Redirects to Stripe onboarding
- [ ] Tested: Returns with "Connected" status
- [ ] Old secret key deleted/rolled (if migrating)
- [ ] Key usage monitored in Stripe Dashboard

## 🎓 Learn More

### Stripe Documentation:
- [Restricted API Keys](https://stripe.com/docs/keys#limit-access)
- [Connect Permissions](https://stripe.com/docs/connect/authentication)
- [OAuth Scopes](https://stripe.com/docs/connect/oauth-reference)
- [Key Management Best Practices](https://stripe.com/docs/keys#safe-keys)

## 💡 Quick Reference

### Restricted Key Format:
```
Test Mode:  rk_test_...
Live Mode:  rk_live_...
```

### Secret Key Format (Don't Use):
```
Test Mode:  sk_test_...
Live Mode:  sk_live_...
```

### Supabase Environment Variable:
```
Name:  STRIPE_SECRET_KEY
Value: rk_test_... (or rk_live_... for production)
```

### Minimum Required Permissions:
```
1. Accounts → Write
2. Account Links → Write
3. OAuth → Full access
4. Checkout Sessions → Write
```

## 🎉 Benefits Summary

By using a restricted key instead of secret key:

✅ **Better Security** - Limited access if compromised
✅ **Compliance Ready** - Follows security best practices
✅ **Easier Auditing** - Clear what key can/cannot do
✅ **Peace of Mind** - Reduced risk to your platform
✅ **Same Functionality** - Works exactly like secret key for your use case

**Bottom line:** Restricted keys give you the same functionality with better security. Always use them when possible! 🔐
