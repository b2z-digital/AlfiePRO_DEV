# Multi-Level Membership Fee Cascade System

## Overview

A cutting-edge, transparent system for managing membership fees from clubs → state associations → national associations. This system provides complete visibility, automated tracking, and flexible reconciliation of membership contributions across all organizational levels.

---

## How It Works

### 1. Fee Flow Architecture

```
Member Payment ($X)
    ↓
Club Receives Full Payment
    ↓
Club Owes → State Association ($15)
    ↓
State Owes → National Association ($5)
    ↓
Club Retains → Balance ($X - $20)
```

### 2. Automatic Remittance Tracking

**When a membership payment is made:**
1. System automatically creates a `membership_remittance` record
2. Calculates fee splits based on current fee structure
3. Tracks payment status at each level (club→state, state→national)
4. Links to actual payment records for full audit trail

### 3. Payment Methods Supported

- **Bulk Annual Payments**: Club pays lump sum by July 31 for all memberships
- **Individual Payments**: Per-member payments throughout the year
- **Automatic Reconciliation**: Match payments to outstanding remittances

---

## Database Tables

### `membership_fee_structures`
Configurable fee amounts at state and national levels.

**Key Fields:**
- `state_contribution_amount` (default: $15.00)
- `national_contribution_amount` (default: $5.00)
- `effective_from` / `effective_to` (historical tracking)

**Features:**
- State/National admins can update fees
- Historical record of all fee changes
- Automatic application based on membership date

### `membership_remittances`
Individual member fee tracking from club through to national.

**Key Fields:**
- `total_membership_fee` - Original payment amount
- `state_contribution_amount` - Amount owed to state
- `national_contribution_amount` - Amount owed to national
- `club_retained_amount` - Amount club keeps
- `club_to_state_status` - Payment status (pending/paid/overdue)
- `state_to_national_status` - Payment status
- `membership_year` - Which year this belongs to

**Status Values:**
- `pending` - Not yet paid
- `paid` - Fully paid
- `overdue` - Past due date
- `waived` - Manually waived

### `association_payments`
Records of actual payments between entities.

**Payment Types:**
- `bulk` - Annual lump sum payment
- `individual` - Single member payment

**Payment Flow Examples:**
```
Club → State Association (bulk, $15 × 100 members = $1,500)
Club → State Association (individual, $15 per new member)
State → National Association (bulk, $5 × 100 members = $500)
```

### `remittance_reconciliations`
Links payments to specific member remittances.

**Purpose:**
- Track which members are covered by each payment
- Enable partial reconciliation
- Provide complete audit trail

---

## Key Features

### 1. **Real-Time Visibility**

**Club Dashboard:**
- Outstanding liability to State Association
- List of members not yet remitted
- Total pending payments by year
- Payment history

**State Association Dashboard:**
- Outstanding receivables from each club
- Total owed to National Association
- Club-by-club breakdown
- Overdue payment alerts

**National Association Dashboard:**
- Outstanding receivables from each state
- Total expected vs received
- State-by-state breakdown

### 2. **Flexible Payment Reconciliation**

**Bulk Annual Payment (July 31):**
```typescript
// Club admin records bulk payment
{
  from_entity_type: 'club',
  from_entity_id: club_id,
  to_entity_type: 'state_association',
  to_entity_id: state_id,
  payment_type: 'bulk',
  amount: 1500, // 100 members × $15
  payment_date: '2025-07-31',
  period_start_date: '2024-07-01',
  period_end_date: '2025-06-30',
  membership_year: 2025
}
```

**System Auto-Reconciles:**
- Finds all pending remittances for that club/year
- Marks them as paid
- Updates payment status
- Generates confirmation report

**Individual Payment:**
```typescript
// New member joins in October
{
  payment_type: 'individual',
  amount: 15,
  payment_date: '2025-10-15',
  // Links to specific member remittance
}
```

### 3. **Configurable Fee Structure**

**State Admin Updates Fees:**
```sql
INSERT INTO membership_fee_structures (
  state_association_id,
  national_association_id,
  state_contribution_amount,
  national_contribution_amount,
  effective_from,
  notes
) VALUES (
  'state-uuid',
  'national-uuid',
  20.00, -- Increased from $15
  7.00,  -- Increased from $5
  '2026-01-01',
  'Fee increase for 2026 membership year'
);
```

**Historical Tracking:**
- All past fee structures retained
- System uses correct fee based on membership date
- Easy to generate historical reports

### 4. **Comprehensive Reports**

**Club Reports:**
- Outstanding Remittances Report
- Payment History by Year
- Member Remittance Status (paid/pending)
- CSV Export for Accounting

**State Reports:**
- Club Payment Summary
- Outstanding Receivables by Club
- National Remittance Status
- Overdue Payment Report

**National Reports:**
- State Payment Summary
- Total Receivables by State
- Year-over-Year Comparison

---

## Frontend Implementation Guide

### Component Structure

```
/src/components/membership-remittances/
├── ClubRemittanceDashboard.tsx       # Club view
├── StateRemittanceDashboard.tsx      # State view
├── NationalRemittanceDashboard.tsx   # National view
├── RecordPaymentModal.tsx            # Record bulk/individual payment
├── ReconcilePaymentModal.tsx         # Match payment to remittances
├── FeeStructureSettings.tsx          # Configure fee amounts
└── RemittanceReports.tsx             # Export reports/CSV
```

### Key UI Components

#### 1. **Club Dashboard**

**Outstanding Summary Card:**
```
┌─────────────────────────────────────┐
│ Outstanding to State Association    │
│                                     │
│ 45 Members Pending                  │
│ Total Owed: $675.00                 │
│                                     │
│ [Record Payment] [View Details]     │
└─────────────────────────────────────┘
```

**Member Remittance Table:**
```
Member Name | Year | Fee  | State Owed | Status  | Actions
────────────┼──────┼──────┼────────────┼─────────┼────────
John Smith  | 2025 | $100 | $15        | Pending | [Pay]
Jane Doe    | 2025 | $100 | $15        | Paid ✓  | [View]
```

#### 2. **Record Payment Modal**

```
┌─────────────────────────────────────┐
│ Record Payment to State Association │
│                                     │
│ Payment Type:                       │
│ ○ Bulk Annual Payment               │
│ ○ Individual Member Payment         │
│                                     │
│ Amount: $______                     │
│ Payment Date: [Date Picker]         │
│ Payment Method: [Dropdown]          │
│ Reference: ____________             │
│                                     │
│ [Auto-Match Remittances]            │
│                                     │
│ [Cancel]          [Record Payment]  │
└─────────────────────────────────────┘
```

#### 3. **State Dashboard**

**Receivables by Club:**
```
┌─────────────────────────────────────┐
│ Outstanding Receivables from Clubs  │
│                                     │
│ Club A: 23 members × $15 = $345     │
│ Club B: 45 members × $15 = $675     │
│ Club C: 12 members × $15 = $180     │
│                                     │
│ Total Outstanding: $1,200           │
│                                     │
│ [Send Reminder] [Export Report]     │
└─────────────────────────────────────┘
```

**Payment to National:**
```
┌─────────────────────────────────────┐
│ Outstanding to National Association │
│                                     │
│ 80 Members × $5 = $400              │
│                                     │
│ [Record Payment to National]        │
└─────────────────────────────────────┘
```

#### 4. **Fee Structure Settings**

```
┌─────────────────────────────────────┐
│ Fee Structure Configuration         │
│                                     │
│ Current Structure (2025):           │
│ State Contribution: $15.00          │
│ National Contribution: $5.00        │
│                                     │
│ [Add New Fee Structure]             │
│                                     │
│ ┌─────────────────────────────┐    │
│ │ New Fee Structure           │    │
│ │                             │    │
│ │ Effective From: [Date]      │    │
│ │ State: $____                │    │
│ │ National: $____             │    │
│ │                             │    │
│ │ [Save]  [Cancel]            │    │
│ └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### API Functions

```typescript
// Get outstanding remittances
const { data } = await supabase
  .rpc('get_outstanding_club_remittances', {
    p_club_id: clubId,
    p_status: 'pending'
  });

// Get club outstanding total
const { data } = await supabase
  .rpc('get_club_outstanding_total', {
    p_club_id: clubId
  });

// Record bulk payment
const { data } = await supabase
  .from('association_payments')
  .insert({
    from_entity_type: 'club',
    from_entity_id: clubId,
    to_entity_type: 'state_association',
    to_entity_id: stateId,
    payment_type: 'bulk',
    amount: totalAmount,
    payment_date: paymentDate,
    payment_method: method,
    membership_year: year
  });

// Mark remittances as paid
const { data } = await supabase
  .rpc('mark_remittances_as_paid', {
    p_remittance_ids: remittanceIds,
    p_payment_id: paymentId,
    p_level: 'club_to_state'
  });
```

---

## Automated Workflows

### 1. **New Member Joins**

```
Member Payment Created
    ↓
Trigger: create_membership_remittance_on_payment()
    ↓
System automatically:
- Gets current fee structure
- Calculates splits (club/state/national)
- Creates remittance record with status 'pending'
- Links to membership payment
    ↓
Club sees new outstanding liability
```

### 2. **Club Records Bulk Payment**

```
Club Admin Records Payment
    ↓
System:
- Creates association_payment record
- Runs auto-reconciliation
- Finds all pending remittances for that year
- Marks them as 'paid'
- Updates paid_date and reference
    ↓
State sees payment received
Club sees updated status
```

### 3. **State Pays National**

```
State Admin Records Payment to National
    ↓
System:
- Creates association_payment (state → national)
- Updates state_to_national_status on remittances
- Marks as 'paid'
    ↓
National sees payment received
```

### 4. **Overdue Detection**

```
Scheduled Job (runs daily):
- Find remittances > 90 days old with status 'pending'
- Update status to 'overdue'
- Send notification to club admin
- Alert state association
```

---

## Reporting & Exports

### CSV Export Formats

**Club Remittance Export:**
```csv
Member Name,Member Email,Year,Total Fee,State Owed,National Owed,Status,Days Outstanding
John Smith,john@email.com,2025,100.00,15.00,5.00,Pending,45
Jane Doe,jane@email.com,2025,100.00,15.00,5.00,Paid,0
```

**State Club Summary:**
```csv
Club Name,Pending Count,Total Outstanding,Oldest Unpaid Date
Sailing Club A,23,345.00,2025-01-15
Sailing Club B,45,675.00,2025-02-20
```

**Payment History:**
```csv
Date,From,To,Type,Amount,Status,Reference
2025-07-31,Club A,State,Bulk,1500.00,Reconciled,EFT-12345
2025-10-15,Club A,State,Individual,15.00,Reconciled,EFT-12346
```

---

## Security & Permissions

### Role-Based Access

**Club Admin:**
- View own club's remittances
- Record payments to state
- Export club reports
- Cannot modify state/national fees

**State Admin:**
- View all club remittances in their state
- Update remittance status (mark as paid/waived)
- Record payments to national
- Configure state fee amounts
- Export state reports

**National Admin:**
- View all state remittances
- Update fee structures
- Export national reports
- View payment history across all states

### Data Privacy

- Clubs can only see their own member data
- States can only see aggregated club data
- National can only see aggregated state data
- All financial data encrypted at rest

---

## Benefits

### ✅ **For Clubs**
- Clear visibility of outstanding liabilities
- Simple bulk payment process (once per year)
- Automatic tracking of individual member payments
- Exportable reports for accounting
- No manual calculations needed

### ✅ **For State Associations**
- Real-time view of receivables from each club
- Easy identification of overdue payments
- Automated reminders to clubs
- Simple reconciliation process
- Clear audit trail for national payments

### ✅ **For National Association**
- Complete visibility across all states
- Automated tracking of state payments
- Historical trend analysis
- Budget forecasting based on membership numbers

### ✅ **For All**
- Complete transparency
- Audit trail for every transaction
- Flexible fee structure updates
- CSV exports for accounting systems
- Automated workflows reduce manual work

---

## Implementation Checklist

### Phase 1: Database & Backend
- [x] Create database tables
- [x] Set up RLS policies
- [x] Create automation functions
- [x] Create helper functions for reports

### Phase 2: Frontend Components (Next Steps)
- [ ] Club Remittance Dashboard
- [ ] State Remittance Dashboard
- [ ] National Remittance Dashboard
- [ ] Record Payment Modal
- [ ] Fee Structure Settings Page
- [ ] Report Export Functionality

### Phase 3: Integration
- [ ] Link to existing membership payment flow
- [ ] Integrate with finance/transaction system
- [ ] Set up automated email reminders
- [ ] Create scheduled jobs for overdue detection

### Phase 4: Testing & Documentation
- [ ] Test bulk payment reconciliation
- [ ] Test individual payment flow
- [ ] Test fee structure updates
- [ ] User documentation
- [ ] Admin training materials

---

## Next Steps

1. **Review & Approve**: Confirm this approach meets your requirements
2. **Fee Amounts**: Confirm default amounts ($15 state, $5 national)
3. **Build Frontend**: Create the dashboard components
4. **Test with Sample Data**: Run through complete payment cycle
5. **User Training**: Document processes for clubs and associations

This system provides a cutting-edge, transparent, and automated solution for managing multi-level membership fee contributions. The architecture is flexible enough to handle various payment scenarios while maintaining complete visibility and auditability.
