# Stripe Connect - Club Payment Accounts

## Overview

AlfiePRO uses Stripe Connect to allow each club to have their own Stripe account while being managed under the platform's main Stripe account. This ensures payment isolation and compliance.

## Architecture

### Platform Stripe Account (AlfiePRO)
- **Location**: Edge function secrets (`STRIPE_SECRET_KEY`)
- **Type**: Standard Stripe account
- **Purpose**: Acts as the platform/parent account that manages all club accounts

### Club Stripe Accounts
- **Type**: Stripe Connect Express accounts OR OAuth Standard accounts
- **Storage**: `clubs.stripe_account_id` column in database
- **Purpose**: Each club's own payment processing account
- **Features**:
  - Card payments capability
  - Transfers capability
  - Isolated financials per club
  - Club keeps 100% of payments (no platform fees)

## How It Works

### 1. Connecting a Club to Stripe

**User Flow:**
1. Club admin navigates to Settings → Membership Payment Integration
2. Clicks "Connect to Stripe" button
3. **Chooses connection type:**
   - **Connect Existing Account** (OAuth): Link an existing Stripe account
   - **Create New Account** (Express): Quick setup with new managed account
4. Gets redirected to Stripe for setup/authorization
5. Completes verification process
6. Returns to AlfiePRO with account connected

**Technical Flow - Express Account (New):**
```
Frontend → StripeConnectionChoiceModal → "Create New Account"
  ↓ handleConnectStripe('express')
  ↓ POST /functions/v1/connect-stripe { connection_type: 'express' }
Edge Function (connect-stripe)
  ↓ stripe.accounts.create({ type: 'express' })
  ↓ stripe.accountLinks.create()
  ↓ stores stripe_account_id in clubs table
  → redirects to Stripe onboarding
  → returns with ?stripe_connected=true
  → success notification
```

**Technical Flow - OAuth Account (Existing):**
```
Frontend → StripeConnectionChoiceModal → "Connect Existing Account"
  ↓ handleConnectStripe('oauth')
  ↓ POST /functions/v1/connect-stripe { connection_type: 'oauth' }
Edge Function (connect-stripe)
  ↓ Builds OAuth URL with client_id
  → redirects to Stripe OAuth authorize
  → User logs into existing Stripe account
  → returns with ?oauth_callback=true&code=...&state=club_id
Frontend → handleOAuthCallback()
  ↓ POST /functions/v1/connect-stripe { code, state }
Edge Function
  ↓ stripe.oauth.token({ code })
  ↓ stores stripe_account_id in clubs table
  → success notification
```

### 2. Processing Payments

When a member pays via Stripe:
- Payment goes directly to the **club's** Stripe account
- Platform does NOT take a cut
- Transaction automatically created in club's finance records
- Stripe fees (1.75% + $0.30 AUD) calculated and recorded

### 3. Disconnecting Stripe

Club admins can disconnect their Stripe account at any time:
- Clears `stripe_account_id` from database
- Sets `stripe_enabled` to false
- "Connect to Stripe" button reappears
- Can reconnect with same or different account

## Database Schema

```sql
-- clubs table
ALTER TABLE clubs ADD COLUMN stripe_account_id TEXT;
ALTER TABLE clubs ADD COLUMN stripe_enabled BOOLEAN DEFAULT false;

-- Example data
{
  "id": "club-uuid",
  "name": "Lake Macquarie Radio Yacht Club",
  "stripe_account_id": "acct_1234567890",
  "stripe_enabled": true
}
```

## Edge Functions

### `/functions/v1/connect-stripe`

**Request (Express):**
```json
{
  "club_id": "uuid",
  "connection_type": "express"
}
```

**Request (OAuth):**
```json
{
  "club_id": "uuid",
  "connection_type": "oauth"
}
```

**Request (OAuth Callback):**
```json
{
  "club_id": "uuid",
  "code": "ac_...",
  "state": "club-uuid"
}
```

**Response (Initial):**
```json
{
  "url": "https://connect.stripe.com/setup/..." // Express
  // OR
  "url": "https://connect.stripe.com/oauth/authorize?..." // OAuth
}
```

**Response (OAuth Callback):**
```json
{
  "success": true,
  "account_id": "acct_1234567890"
}
```

### `/functions/v1/create-stripe-checkout`

Creates checkout session using club's connected account:
```typescript
stripe.checkout.sessions.create({
  // ... session config
}, {
  stripeAccount: club.stripe_account_id // Uses club's account!
})
```

## Important Notes

1. **Payment Isolation**: Each club's payments are completely isolated in their own Stripe account
2. **Compliance**: Clubs maintain their own merchant accounts and are responsible for their own tax reporting
3. **Platform Control**: AlfiePRO platform can view account status but doesn't control funds
4. **Onboarding**: Stripe handles all KYC/verification through their onboarding flow
5. **Multiple Accounts**: A club can disconnect and reconnect different Stripe accounts as needed
6. **Two Connection Methods**:
   - **Express**: Best for clubs without Stripe accounts - quick setup, managed by platform
   - **OAuth**: Best for clubs with existing Stripe accounts - full control, can disconnect anytime

## Security

- Only club admins can connect/disconnect Stripe
- Verified via `user_clubs.role = 'admin'` check
- Stripe account ID stored securely in database
- Platform secret key stored in edge function environment
- OAuth requires `STRIPE_CLIENT_ID` for existing account connections

## Testing

To test Stripe Connect integration:
1. Use Stripe test mode keys
2. Connect test account via onboarding flow
3. Process test payments
4. Verify transactions appear in club's finance records
5. Check Stripe dashboard shows connected account

## Troubleshooting

**Issue**: "Connect to Stripe" button doesn't appear
- Check: `stripe_enabled` is false in database
- Check: Page refreshed after disconnecting

**Issue**: Connection fails
- Check: `STRIPE_SECRET_KEY` is set in edge function secrets
- Check: User is club admin
- Check: Edge function logs for errors

**Issue**: Payments go to wrong account
- Check: `stripe_account_id` is correct in database
- Check: Checkout session uses `stripeAccount` parameter
- Check: Club's Stripe account is fully activated
