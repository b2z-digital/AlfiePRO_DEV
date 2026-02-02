# Finance Integration Plan - Membership Payments

## Overview
Integrate membership payments (both bank transfer and Stripe) with the club's finance system to provide comprehensive financial tracking and reporting.

## Current State Analysis

### Existing Finance System
- Finance categories for income/expenses
- Transaction tracking
- Budget management
- Invoice generation
- Tax configuration

### Existing Payment System
- Membership applications with payment method selection
- Bank transfer tracking via payment_status
- Stripe Connect integration for card payments
- Payment reconciliation modal

## Recommended Integration Architecture

### 1. **Club Financial Configuration**

#### A. Tax Settings (per club)
```typescript
clubs table additions:
- tax_enabled: boolean (default false)
- tax_rate: decimal (e.g., 0.10 for 10% GST/VAT)
- tax_name: text (e.g., "GST", "VAT", "Sales Tax")
- tax_registration_number: text (e.g., ABN in Australia)
```

#### B. Default Membership Income Category
```typescript
clubs table additions:
- default_membership_category_id: uuid (FK to finance_categories)
- stripe_account_id: text (existing - for connected account)
- stripe_enabled: boolean (whether Stripe payments are active)
```

### 2. **Automated Transaction Creation**

#### A. Bank Transfer Applications
**Workflow:**
1. Application approved with bank_transfer → Member created with payment_status='pending'
2. Create PENDING transaction in finance system:
   - Type: 'deposit' (income)
   - Category: default_membership_category_id
   - Amount: membership_amount
   - Status: 'pending'
   - Description: "Membership: {member_name} - {membership_type}"
   - Reference: member_id
   - Payment method: 'bank_transfer'
   - Expected date: date_joined

3. Admin confirms payment via reconciliation → Update transaction:
   - Status: 'completed'
   - Completed date: payment_confirmed_at
   - Add bank reference if provided

#### B. Stripe Card Payments
**Workflow:**
1. Application approved with credit_card → Redirect to Stripe Checkout
2. Stripe webhook receives payment.succeeded → Create transaction:
   - Type: 'deposit'
   - Category: default_membership_category_id
   - Amount: amount_received (after Stripe fees)
   - Status: 'completed'
   - Description: "Membership: {member_name} - {membership_type}"
   - Reference: member_id
   - Payment method: 'credit_card'
   - Stripe payment ID: payment_intent_id
   - Stripe fee: Calculate from Stripe data
   - Net amount: amount - stripe_fee

3. Update member record:
   - payment_status: 'paid'
   - payment_confirmed_at: timestamp
   - Set is_financial: true

### 3. **Database Schema Changes**

#### A. New Table: `membership_transactions`
Links members to finance transactions for easy tracking:
```sql
CREATE TABLE membership_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id),
  member_id uuid REFERENCES members(id),
  transaction_id uuid REFERENCES finance_transactions(id),
  membership_type_id uuid REFERENCES membership_types(id),
  amount decimal NOT NULL,
  tax_amount decimal DEFAULT 0,
  total_amount decimal NOT NULL,
  payment_method text CHECK (payment_method IN ('bank_transfer', 'credit_card', 'cash')),
  payment_status text CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_fee decimal,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### B. Update `finance_transactions` table
Add fields for payment gateway tracking:
```sql
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS:
- payment_gateway text (e.g., 'stripe', 'manual')
- gateway_transaction_id text
- gateway_fee decimal
- net_amount decimal (amount after fees)
- linked_entity_type text (e.g., 'membership', 'invoice', 'event')
- linked_entity_id uuid
```

#### C. Update `clubs` table
```sql
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS:
- tax_enabled boolean DEFAULT false
- tax_rate decimal
- tax_name text
- tax_registration_number text
- default_membership_category_id uuid REFERENCES finance_categories(id)
- stripe_enabled boolean DEFAULT false
```

### 4. **Finance Dashboard Enhancements**

#### A. Membership Income Overview
Add widget showing:
- Total membership income (current period)
- Pending bank transfers (awaiting confirmation)
- Successful Stripe payments
- Breakdown by membership type
- Renewal tracking (upcoming renewals)

#### B. Payment Reconciliation View
In Finances section:
- List of pending membership payments
- Quick confirm button
- Match bank statements
- Bulk reconciliation

#### C. Stripe Fee Tracking
- Automatic Stripe fee calculation
- Net revenue reporting
- Fee trends over time

### 5. **Implementation Steps**

#### Phase 1: Database & Configuration (Critical)
1. Create migrations for all schema changes
2. Add club settings page for tax configuration
3. Add membership category selector in club settings
4. Create membership_transactions table

#### Phase 2: Bank Transfer Integration
1. Create transaction on application approval (pending status)
2. Link transaction to member via membership_transactions
3. Update transaction when payment confirmed in reconciliation
4. Add finance transaction link in member details

#### Phase 3: Stripe Integration
1. Update Stripe webhook handler
2. Create completed transactions on payment success
3. Calculate and record Stripe fees
4. Handle failed payments and refunds
5. Auto-update member status

#### Phase 4: Reporting & Analytics
1. Membership income reports
2. Tax reports (if enabled)
3. Payment method analysis
4. Stripe fee analysis
5. Pending payments dashboard

#### Phase 5: UI Enhancements
1. Finance widgets on dashboard
2. Member payment history view
3. Quick reconciliation interface
4. Stripe payment status tracking

### 6. **Tax Handling**

#### Tax-Inclusive Pricing (Recommended for AU/NZ)
```typescript
membership_amount: $115.00 (includes $10.45 GST at 10%)
tax_amount: $10.45
base_amount: $104.55

Transaction records:
- Total: $115.00
- Tax: $10.45
- Net: $104.55
```

#### Tax-Exclusive Pricing (US/EU)
```typescript
membership_amount: $100.00
tax_amount: $10.00 (at 10%)
total_amount: $110.00

Transaction records:
- Subtotal: $100.00
- Tax: $10.00
- Total: $110.00
```

### 7. **Stripe Fee Calculation**

Standard Stripe rates (varies by region):
```typescript
// Australia example
const STRIPE_RATE = 0.0175; // 1.75%
const STRIPE_FIXED = 0.30; // $0.30 AUD

function calculateStripeFee(amount: number): number {
  return (amount * STRIPE_RATE) + STRIPE_FIXED;
}

// Example: $115.00 membership
Gross amount: $115.00
Stripe fee: $2.31 (1.75% + $0.30)
Net amount: $112.69
```

### 8. **Reporting Benefits**

Once integrated, clubs can:
1. **See real-time income** from memberships
2. **Track pending payments** needing confirmation
3. **Generate tax reports** automatically
4. **Analyze payment methods** (bank vs card adoption)
5. **Calculate Stripe costs** and optimize
6. **Forecast income** based on renewals
7. **Reconcile bank statements** easily
8. **Generate financial statements** including membership income

### 9. **Security Considerations**

- Stripe webhooks verified with signing secret
- Transaction creation uses RLS policies
- Only club admins can confirm payments
- Audit trail for all payment confirmations
- Stripe keys stored securely (env variables)

### 10. **User Experience Flow**

#### Bank Transfer Flow:
1. Member applies, selects bank transfer
2. Admin approves → Transaction created (pending)
3. Finance dashboard shows pending payment
4. Member transfers funds
5. Admin sees pending payment in reconciliation
6. Admin confirms → Transaction completed, finance updated

#### Stripe Flow:
1. Member applies, selects card payment
2. Admin approves → Redirect to Stripe Checkout
3. Member pays via Stripe
4. Webhook → Transaction created automatically
5. Member marked as financial
6. Finance dashboard updated instantly
7. Email confirmations sent

## Recommendation Summary

**Priority 1: Essential Integration**
- Add tax configuration to clubs
- Add default membership category to clubs
- Create membership_transactions linking table
- Auto-create pending transactions for bank transfers
- Auto-create completed transactions for Stripe payments

**Priority 2: Enhanced Tracking**
- Stripe fee calculation and tracking
- Payment method analytics
- Membership income dashboard widgets
- Quick reconciliation in finance section

**Priority 3: Advanced Features**
- Tax reporting
- Renewal forecasting
- Payment trend analysis
- Automated reminders for pending payments

This creates a **comprehensive, automated system** where:
- All membership payments flow into your finance system
- Tax is calculated correctly
- Stripe fees are tracked
- Reconciliation is streamlined
- Financial reporting is accurate and complete
