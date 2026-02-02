

# Event Payment System - Implementation Guide

## Overview

This guide documents the complete event payment and registration system that allows clubs to collect entry fees for paid events, both online and at the event.

## Features Implemented

### 1. Database Schema
- **event_registrations** table: Tracks all event registrations with payment status
- **event_payment_transactions** table: Records all payment transactions
- Automatic financial integration: Payments create finance transactions in "Event Fees" category
- Support for both member and guest registrations

### 2. Payment Methods
- **Pay Now Online**: Stripe checkout for immediate payment
- **Pay at Event**: Mark payment for collection at registration desk
- **Waived**: For free events or comp entries

### 3. Registration Types
- **Member Registration**: For authenticated Alfie users
- **Guest Registration**: For non-members with manual entry form

## Database Migrations

### Migration 1: Event Registrations and Payments
**File**: `supabase/migrations/20251030023125_create_event_registration_and_payments.sql`

Creates:
- `event_registrations` table with all registration fields
- `event_payment_transactions` table for payment tracking
- RLS policies for secure access
- Trigger to automatically create financial transactions

### Migration 2: Default Event Fees Category
**File**: `supabase/migrations/20251030023200_add_default_event_fee_category.sql`

- Ensures all clubs have "Event Fees" income category
- Auto-creates category for new clubs
- Links to finance system

## Edge Functions

### 1. Create Event Checkout
**File**: `supabase/functions/create-event-checkout/index.ts`

Creates Stripe Checkout sessions for event payments.

**Usage**:
```typescript
const response = await fetch(`${SUPABASE_URL}/functions/v1/create-event-checkout`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    registration_id: 'uuid',
    event_id: 'uuid',
    club_id: 'uuid',
    amount: 35.00,
    currency: 'aud',
    success_url: 'https://...',
    cancel_url: 'https://...'
  })
});

const { session_id, url } = await response.json();
window.location.href = url; // Redirect to Stripe
```

### 2. Event Payment Webhook
**File**: `supabase/functions/event-payment-webhook/index.ts`

Handles Stripe webhooks for payment status updates.

**Webhook Events Handled**:
- `checkout.session.completed`: Mark payment as complete
- `checkout.session.expired`: Reset to unpaid
- `payment_intent.payment_failed`: Mark as failed
- `charge.refunded`: Process refund

**Webhook URL**: `https://[project-ref].supabase.co/functions/v1/event-payment-webhook`

## Components

### EventRegistrationModal
**File**: `src/components/events/EventRegistrationModal.tsx`

Complete registration flow with three steps:
1. **Type Selection** (if not logged in): Choose Member or Guest
2. **Details Form**: Personal info, boat details, emergency contact
3. **Payment Selection**: Choose payment method

**Props**:
```typescript
interface EventRegistrationModalProps {
  darkMode: boolean;
  eventId: string;
  clubId: string;
  eventName: string;
  entryFee: number;
  currency?: string; // default 'AUD'
  onClose: () => void;
  onSuccess: () => void;
}
```

**Usage Example**:
```tsx
<EventRegistrationModal
  darkMode={darkMode}
  eventId={event.id}
  clubId={event.clubId}
  eventName={event.eventName}
  entryFee={event.entry_fee || 0}
  currency="AUD"
  onClose={() => setShowRegistration(false)}
  onSuccess={() => {
    loadRegistrations();
    setShowRegistration(false);
  }}
/>
```

## Integration Steps

### Step 1: Update EventDetails Component

Add registration button and payment information:

```tsx
import { EventRegistrationModal } from './events/EventRegistrationModal';

// In your component:
const [showRegistration, setShowRegistration] = useState(false);

// In the render:
{event.isPaid && event.entryFee && (
  <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="font-semibold text-blue-400">Entry Fee</h4>
        <p className="text-2xl font-bold text-blue-300">
          ${event.entryFee.toFixed(2)} AUD
        </p>
      </div>
      <button
        onClick={() => setShowRegistration(true)}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
      >
        Register Now
      </button>
    </div>
  </div>
)}

{showRegistration && (
  <EventRegistrationModal
    darkMode={darkMode}
    eventId={event.id}
    clubId={event.clubId}
    eventName={event.eventName}
    entryFee={event.entryFee || 0}
    onClose={() => setShowRegistration(false)}
    onSuccess={() => setShowRegistration(false)}
  />
)}
```

### Step 2: Update "Will You Attend?" Logic

Modify event attendance to check for payment requirement:

```tsx
const handleAttendanceChange = async (status: 'yes' | 'no' | 'maybe') => {
  // If event is paid and user clicks "Yes", show registration modal instead
  if (status === 'yes' && event.isPaid && event.entryFee > 0) {
    setShowRegistration(true);
    return;
  }

  // Otherwise, normal attendance tracking
  await supabase.from('event_attendance').upsert({
    user_id: user.id,
    event_id: event.id,
    club_id: event.clubId,
    status
  });
};
```

### Step 3: Display Registration Status

Show payment status for registered users:

```tsx
const { data: registration } = await supabase
  .from('event_registrations')
  .select('*')
  .eq('event_id', event.id)
  .eq('user_id', user?.id)
  .maybeSingle();

{registration && (
  <div className={`p-4 rounded-lg border ${
    registration.payment_status === 'paid'
      ? 'bg-green-500/10 border-green-500/30'
      : 'bg-yellow-500/10 border-yellow-500/30'
  }`}>
    <div className="flex items-center justify-between">
      <div>
        <h4 className="font-semibold">
          {registration.payment_status === 'paid' ? 'Registered & Paid' : 'Registration Pending'}
        </h4>
        <p className="text-sm opacity-80">
          {registration.payment_status === 'pay_at_event' && 'Pay at registration desk'}
          {registration.payment_status === 'unpaid' && 'Payment not completed'}
          {registration.payment_status === 'paid' && `Paid $${registration.amount_paid}`}
        </p>
      </div>
      {registration.payment_status === 'unpaid' && (
        <button
          onClick={() => setShowRegistration(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Complete Payment
        </button>
      )}
    </div>
  </div>
)}
```

### Step 4: Club Admin Registration Management

Create admin view to manage registrations:

```tsx
// Fetch all registrations for an event
const { data: registrations } = await supabase
  .from('event_registrations')
  .select(`
    *,
    profiles:user_id (first_name, last_name, email)
  `)
  .eq('event_id', eventId)
  .order('created_at', { ascending: false });

// Display in a table with payment status filters
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Boat</th>
      <th>Sail #</th>
      <th>Payment Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {registrations.map(reg => (
      <tr key={reg.id}>
        <td>
          {reg.user_id
            ? `${reg.profiles.first_name} ${reg.profiles.last_name}`
            : `${reg.guest_first_name} ${reg.guest_last_name}`
          }
        </td>
        <td>{reg.boat_name}</td>
        <td>{reg.sail_number}</td>
        <td>
          <span className={`badge ${
            reg.payment_status === 'paid' ? 'badge-success' :
            reg.payment_status === 'pay_at_event' ? 'badge-warning' :
            'badge-danger'
          }`}>
            {reg.payment_status}
          </span>
        </td>
        <td>
          {reg.payment_status === 'pay_at_event' && (
            <button onClick={() => markAsPaid(reg.id)}>
              Mark as Paid
            </button>
          )}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### Step 5: Public Event Registration Page

For events advertised to public (non-members):

```tsx
// Public route: /events/:eventId/register
// No authentication required

export const PublicEventRegistrationPage = () => {
  // Load event details
  const { data: event } = await supabase
    .from('public_events')
    .select('*')
    .eq('id', eventId)
    .single();

  return (
    <div>
      <h1>{event.event_name}</h1>
      {/* Event details */}

      <EventRegistrationModal
        darkMode={false}
        eventId={event.id}
        clubId={event.club_id}
        eventName={event.event_name}
        entryFee={event.entry_fee}
        onClose={() => navigate(-1)}
        onSuccess={() => {
          // Show success message
          toast.success('Registration successful!');
        }}
      />
    </div>
  );
};
```

## Financial Integration

### Automatic Transaction Creation

When a payment is marked as completed, the system automatically:

1. Creates a finance transaction in "Event Fees" category
2. Records the amount, payment method, and participant name
3. Links to the event registration via reference number

### Manual Payment Recording

For "Pay at Event" registrations, club admins can:

```tsx
const markAsPaidAtEvent = async (registrationId: string, amount: number) => {
  // Create payment transaction
  const { error } = await supabase
    .from('event_payment_transactions')
    .insert({
      registration_id: registrationId,
      club_id: currentClub.clubId,
      amount: amount,
      currency: 'AUD',
      payment_method: 'cash',
      payment_status: 'completed',
      transaction_date: new Date().toISOString(),
      notes: 'Paid at event registration desk'
    });

  if (!error) {
    // Update registration
    await supabase
      .from('event_registrations')
      .update({
        payment_status: 'paid',
        amount_paid: amount
      })
      .eq('id', registrationId);
  }
};
```

## Stripe Setup Requirements

### 1. Environment Variables
Add to `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET_EVENTS=whsec_...
```

### 2. Webhook Configuration

In Stripe Dashboard:
1. Go to Developers > Webhooks
2. Add endpoint: `https://[project-ref].supabase.co/functions/v1/event-payment-webhook`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy webhook signing secret to env var

### 3. Connect Accounts

Clubs must connect their Stripe accounts via Stripe Connect (already implemented in your system).

## Testing

### Test Cards (Stripe Test Mode)
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Authentication Required**: 4000 0025 0000 3155

### Test Scenarios

1. **Member Registration with Online Payment**
   - Login as member
   - Click "Register" on paid event
   - Fill boat details
   - Select "Pay Now Online"
   - Complete Stripe checkout
   - Verify payment status updates

2. **Guest Registration with Pay at Event**
   - As guest (not logged in)
   - Fill all guest details
   - Fill boat details
   - Select "Pay at Event"
   - Verify registration created

3. **Admin Manual Payment Processing**
   - Login as club admin
   - View event registrations
   - Find "Pay at Event" registration
   - Mark as paid with cash
   - Verify finance transaction created

## UI/UX Considerations

### For Members
- Pre-fill user details from profile
- Show payment history
- Allow cancellation/refund requests

### For Guests
- Clear, simple form
- Email confirmation
- No account required

### For Admins
- Dashboard showing all registrations
- Filter by payment status
- Export registration list
- Quick payment reconciliation

## Future Enhancements

1. **Email Notifications**
   - Registration confirmation
   - Payment receipt
   - Event reminders

2. **Refund Management**
   - Request refund button
   - Admin approval workflow
   - Automatic Stripe refund processing

3. **Group Registrations**
   - Register multiple people
   - Team/crew management
   - Bulk discount pricing

4. **Waitlist Management**
   - Auto-notify when spot available
   - Priority registration for members

5. **QR Code Check-in**
   - Generate QR codes for paid registrations
   - Scan on race day for quick check-in
   - Verify payment status

## Troubleshooting

### Payment Not Completing
- Check Stripe webhook is configured
- Verify webhook secret is correct
- Check Supabase function logs

### Registration Not Showing
- Check RLS policies
- Verify user has club membership
- Check event_id matches

### Financial Transaction Not Created
- Check finance_categories table has "Event Fees"
- Verify trigger is enabled
- Check Supabase logs for errors

## Security Notes

- All payment processing handled by Stripe
- No credit card data stored in database
- RLS policies prevent unauthorized access
- Guest emails validated before submission
- Admin actions logged for audit trail

## API Reference

### Create Registration
```typescript
const { data, error } = await supabase
  .from('event_registrations')
  .insert({
    event_id: 'uuid',
    club_id: 'uuid',
    user_id: 'uuid', // or null for guest
    registration_type: 'member' | 'guest',
    // ... other fields
  });
```

### Get Event Registrations
```typescript
const { data, error } = await supabase
  .from('event_registrations')
  .select('*')
  .eq('event_id', eventId);
```

### Update Payment Status
```typescript
const { error } = await supabase
  .from('event_registrations')
  .update({ payment_status: 'paid' })
  .eq('id', registrationId);
```

## Support

For implementation questions or issues:
1. Check Supabase logs for errors
2. Verify all migrations ran successfully
3. Test in Stripe test mode first
4. Check RLS policies if access denied

