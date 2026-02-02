# Payment Architecture Guide

## Overview

AlfiePro uses a **dual payment gateway system** to handle two distinct types of payments:

1. **Platform Payments** - Subscription fees paid to AlfiePro (the platform owner)
2. **Club Payments** - Member fees and invoices paid to individual clubs

This separation ensures clean accounting, proper fund routing, and compliance with payment regulations.

---

## System 1: Platform Payments (AlfiePro Subscriptions)

### What It Handles
- Club subscription fees ($49/month)
- State Association subscription fees ($149/month)
- National Association subscription fees ($399/month)
- 30-day free trial management
- Subscription renewals and cancellations

### Stripe Account
- **Uses:** Platform owner's Stripe account
- **Environment Variable:** `STRIPE_SECRET_KEY`
- **Who Gets Paid:** You (AlfiePro platform owner)
- **Configuration:** Set in Supabase Edge Function secrets

### Implementation Files
```
supabase/functions/create-alfie-checkout/index.ts   # Creates subscription checkout
supabase/functions/alfie-stripe-webhook/index.ts    # Handles subscription webhooks
```

### Flow Diagram
```
User Signs Up → Selects Plan → create-alfie-checkout →
Stripe Checkout (Platform Account) → Payment Collected →
alfie-stripe-webhook → Update user_subscriptions table →
Club Activated
```

### Database Tables
- `user_subscriptions` - Tracks platform subscription status
  - `subscription_type`: 'club', 'state', 'national'
  - `status`: 'trialing', 'active', 'past_due', 'cancelled'
  - `trial_end_date`: When free trial ends
  - `stripe_customer_id`: Customer in YOUR Stripe account
  - `stripe_subscription_id`: Subscription in YOUR Stripe account

### Setup Instructions

#### 1. Get Your Stripe Keys
- Sign up for Stripe at https://stripe.com
- Get your Secret Key from Dashboard → Developers → API keys
- Get your Webhook Signing Secret (see step 3)

#### 2. Set Environment Variables
```bash
# In Supabase Dashboard → Project Settings → Edge Functions → Secrets
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 3. Configure Webhook Endpoint
- URL: `https://[your-project].supabase.co/functions/v1/alfie-stripe-webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

#### 4. Test the Integration
- Use Stripe test mode
- Sign up for a club with test card: 4242 4242 4242 4242
- Verify subscription appears in your Stripe dashboard
- Check `user_subscriptions` table has correct data

---

## System 2: Club Payments (Member Fees & Invoices)

### What It Handles
- Member signup fees
- Membership renewals
- Club-generated invoices
- Event registration fees
- Any other club-specific payments

### Stripe Account
- **Uses:** Each club's individual Stripe Connect account
- **Who Gets Paid:** The specific club collecting the payment
- **Configuration:** Set per-club in Finance Settings
- **Optional:** Clubs can choose NOT to use Stripe

### Implementation Files
```
supabase/functions/create-stripe-checkout/index.ts   # Member payment checkout
supabase/functions/stripe-webhook/index.ts           # Club payment webhooks
supabase/functions/connect-stripe/index.ts           # Stripe Connect onboarding
```

### Flow Diagram
```
Member Signs Up → Payment Method Selection →
If Club Has Stripe: create-stripe-checkout →
Stripe Checkout (Club's Connected Account) →
Payment to Club → stripe-webhook →
Update membership_transactions table

If No Stripe: Show Bank Details →
Manual Reconciliation by Club Admin
```

### Database Tables
- `clubs` table has:
  - `stripe_account_id`: Club's Stripe Connect account ID
  - `payment_information`: Bank details for manual payments

- `membership_transactions` table tracks:
  - `payment_method`: 'stripe', 'bank_transfer', 'cash', 'check'
  - `stripe_payment_intent_id`: If paid via Stripe
  - `status`: 'pending', 'completed', 'failed'

### Setup Instructions (For Clubs)

#### Option A: Stripe Connect (Recommended)
1. Club admin navigates to Settings → Finance
2. Clicks "Connect Stripe Account"
3. Completes Stripe Connect onboarding
4. Stripe account ID saved to club record
5. Card payments now available for members

#### Option B: Bank Transfer (Fallback)
1. Club admin navigates to Settings → Finance
2. Enters bank account details
3. Members see bank details on signup
4. Club admin manually reconciles payments
5. Updates payment status in system

---

## Payment Method Selection Logic

### For Member Signup Forms

```typescript
// Check if club has Stripe configured
const { data: club } = await supabase
  .from('clubs')
  .select('stripe_account_id, payment_information')
  .eq('id', clubId)
  .single();

if (club.stripe_account_id) {
  // Show credit card payment option
  // Use create-stripe-checkout edge function
  // Pass club's stripe_account_id
} else {
  // Show bank transfer option only
  // Display club.payment_information
  // Create transaction with status 'pending'
}
```

### In the UI

```jsx
{club.stripe_account_id ? (
  <div>
    <label>Payment Method</label>
    <select>
      <option value="card">Credit Card</option>
      <option value="bank">Bank Transfer</option>
    </select>
  </div>
) : (
  <div>
    <label>Payment Method</label>
    <div className="text-yellow-600">
      Card payments not available. Please pay via bank transfer.
    </div>
    <div className="mt-4 p-4 bg-slate-800 rounded">
      <h4>Bank Details</h4>
      <pre>{club.payment_information}</pre>
    </div>
  </div>
)}
```

---

## Role Hierarchy & Permissions

### Super Admin (Platform Owner)
- **How to set:** Update `profiles.is_super_admin = true` in database
- **Permissions:** Full access to everything
- **Can:**
  - View all clubs
  - Manage platform subscriptions
  - Access all club data
  - Set State/National admins
  - View platform analytics

### National Admin
- **Set via:** `user_clubs.role = 'national_admin'`
- **Permissions:** Manage all clubs nationwide
- **Can:**
  - View/edit all clubs
  - Create state-level events
  - Manage national championships
  - Access nationwide reports
  - Cannot manage platform subscriptions

### State Admin
- **Set via:** `user_clubs.role = 'state_admin'`
- **Permissions:** Manage multiple clubs in a state/region
- **Can:**
  - View/edit clubs in their state
  - Create state-level events
  - Manage state championships
  - Access state-wide reports
  - Cannot manage other states or platform

### Club Admin
- **Set via:** `user_clubs.role = 'admin'`
- **Permissions:** Full control of their club
- **Can:**
  - Manage club members
  - Create events
  - Handle finances
  - Manage club settings
  - Configure Stripe Connect
  - Cannot access other clubs

### Editor
- **Set via:** `user_clubs.role = 'editor'`
- **Permissions:** Content management within club
- **Can:**
  - Create/edit races and events
  - Manage articles and news
  - Update club website
  - Cannot manage members or finances

### Member
- **Set via:** `user_clubs.role = 'member'`
- **Permissions:** Read-only access
- **Can:**
  - View club content
  - See race results
  - View their own profile
  - Cannot edit anything

---

## Database Schema

### New Columns

```sql
-- clubs table
ALTER TABLE clubs ADD COLUMN subscription_tier TEXT
  CHECK (subscription_tier IN ('club', 'state', 'national'));

-- profiles table
ALTER TABLE profiles ADD COLUMN is_super_admin BOOLEAN DEFAULT false;

-- user_clubs table (already exists, now supports new roles)
-- role can be: 'member', 'editor', 'admin', 'state_admin', 'national_admin'
```

### Helper Functions

```sql
-- Check if user is state admin
SELECT is_state_admin('user-uuid');

-- Check if user is national admin
SELECT is_national_admin('user-uuid');

-- Check if user is super admin
SELECT is_super_admin('user-uuid');

-- Get user's highest role
SELECT * FROM user_highest_role WHERE user_id = 'user-uuid';
```

---

## Setting Admin Roles

### Make Yourself Super Admin (One-time setup)

```sql
-- Get your user ID from Supabase Dashboard → Authentication → Users
-- Update your profile
UPDATE profiles
SET is_super_admin = true
WHERE id = 'your-user-uuid';
```

### Promote User to State Admin

```sql
-- Find the user and club(s) they should manage
INSERT INTO user_clubs (user_id, club_id, role)
VALUES ('user-uuid', 'club-uuid', 'state_admin')
ON CONFLICT (user_id, club_id)
DO UPDATE SET role = 'state_admin';
```

### Promote User to National Admin

```sql
-- Give them national admin role for any club
-- They'll have access to ALL clubs
INSERT INTO user_clubs (user_id, club_id, role)
VALUES ('user-uuid', (SELECT id FROM clubs LIMIT 1), 'national_admin')
ON CONFLICT (user_id, club_id)
DO UPDATE SET role = 'national_admin';
```

---

## Testing Checklist

### Platform Payments
- [ ] Sign up new club with trial
- [ ] Verify subscription in YOUR Stripe dashboard
- [ ] Check `user_subscriptions` table
- [ ] Wait for trial to convert (or test with 1-day trial)
- [ ] Verify payment collected
- [ ] Test cancellation
- [ ] Test reactivation

### Club Payments (With Stripe)
- [ ] Club connects Stripe account
- [ ] Member signs up with card payment
- [ ] Verify payment in CLUB's Stripe dashboard
- [ ] Check `membership_transactions` table
- [ ] Test refund scenario

### Club Payments (Without Stripe)
- [ ] Member signs up at club without Stripe
- [ ] Verify bank details shown
- [ ] Admin manually marks payment as received
- [ ] Check `membership_transactions` updated

### Roles
- [ ] Set yourself as super admin
- [ ] Create state admin user
- [ ] Create national admin user
- [ ] Verify permissions work correctly
- [ ] Test multi-club access for state/national admins

---

## Common Issues & Solutions

### Issue: "Stripe not configured" error
**Solution:** Set `STRIPE_SECRET_KEY` in Supabase Edge Function secrets

### Issue: Webhook not firing
**Solution:**
1. Check webhook URL is correct
2. Verify webhook secret matches environment variable
3. Check Stripe Dashboard → Developers → Webhooks for errors

### Issue: Payment goes to wrong account
**Solution:**
- Platform subscriptions should use YOUR Stripe account
- Member payments should use CLUB's Stripe Connect account
- Verify which edge function is being called

### Issue: Club wants to accept payments but doesn't have Stripe
**Solution:**
- Show bank transfer option only
- Provide manual reconciliation interface
- Allow admin to mark payments as received

### Issue: Trial doesn't convert to paid
**Solution:**
- Check webhook is receiving `invoice.payment_succeeded` event
- Verify `user_subscriptions.trial_end_date` is set correctly
- Ensure payment method was collected during checkout

---

## Revenue Flow

### Platform Revenue (You)
```
User pays $49/month for Club subscription
→ Goes to YOUR Stripe account
→ Stripe takes ~2.9% + 30¢
→ You receive ~$47.58/month net
```

### Club Revenue
```
Member pays $100 membership fee
→ Goes to CLUB's Stripe account (if configured)
→ Stripe takes ~2.9% + 30¢
→ Club receives ~$97.10 net
→ You don't touch this money
```

### Why This Matters
- **Legal:** Each entity (platform vs club) handles their own payments
- **Accounting:** Clean separation of funds
- **Tax:** Easier tax reporting for all parties
- **Trust:** Clubs control their own money

---

## Next Steps

1. **Set your Stripe keys** for platform subscriptions
2. **Make yourself super admin** in the database
3. **Test a club signup** with free trial
4. **Connect a club to Stripe** (if they want card payments)
5. **Test member signup** with both payment methods
6. **Create state/national admins** as needed
7. **Build state/national admin features** (future work)

---

## Support

If you need help:
1. Check Stripe Dashboard → Developers → Logs for API errors
2. Check Supabase Dashboard → Edge Functions → Logs for function errors
3. Check browser console for frontend errors
4. Review this document for configuration steps
