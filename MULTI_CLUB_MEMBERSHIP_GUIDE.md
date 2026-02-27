# Multi-Club Membership & Associate Member Fee System

## Overview

The system now supports members joining multiple clubs with smart association fee handling. Members only pay state and national association fees once per year, regardless of how many clubs they join.

## Membership Types

### 1. Primary Membership
- **First club** a member joins
- Pays: Club Fee + State Fee + National Fee
- `relationship_type: 'primary'`
- `pays_association_fees: true`

### 2. Associate Membership
- **Additional clubs** a member joins
- Pays: Club Fee ONLY (no state or national fees)
- `relationship_type: 'associate'`
- `pays_association_fees: false` (auto-detected)

### 3. Social Membership
- Limited club participation
- Pays: Reduced Club Fee
- `relationship_type: 'social'`
- `pays_association_fees: false`

### 4. Family Membership
- Family members of primary members
- Pays: Reduced Club Fee
- `relationship_type: 'family'`
- `pays_association_fees: false`

## How It Works

### Automatic Fee Detection

When a member applies to join a second club, the system:

1. **Checks existing memberships**: Looks for any active primary membership
2. **Checks fee payment status**: Verifies if state/national fees were already paid this year
3. **Auto-assigns relationship type**:
   - If they have a paid primary membership → `associate` (no association fees)
   - If first membership → `primary` (pays all fees)

### Smart Fee Calculation

The `should_pay_association_fees()` function automatically determines if association fees apply:

```sql
-- Returns true if member should pay association fees
-- Returns false if:
--   1. They're social or family members
--   2. They already have a paid primary membership in the same association
--   3. They've already paid state/national fees this year
```

## Database Structure

### club_memberships Table

Each membership is a separate record:

```sql
{
  member_id: uuid,              -- The user
  club_id: uuid,                -- The club
  relationship_type: enum,       -- primary|associate|social|family
  status: text,                  -- active|pending|expired|archived
  pays_association_fees: boolean -- Auto-set based on relationship
  annual_fee_amount: numeric     -- Club fee amount
}
```

### membership_remittances Table

Tracks fee payments to associations:

```sql
{
  member_id: uuid,
  club_id: uuid,
  state_association_id: uuid,
  national_association_id: uuid,
  state_fee_amount: numeric,
  national_fee_amount: numeric,
  club_to_state_status: text,    -- paid|pending|none
  state_to_national_status: text  -- paid|pending|none
}
```

## User Journey Examples

### Example 1: New Member Joins First Club

1. User applies to Lake Macquarie RC
2. System creates `club_memberships` record:
   - `relationship_type: 'primary'`
   - `pays_association_fees: true`
3. Fee calculation:
   - Club Fee: $50
   - State Fee: $15 (NSW)
   - National Fee: $10 (AUS)
   - **Total: $75**

### Example 2: Existing Member Joins Second Club

1. User (already member of Lake Macquarie RC) applies to Port Stephens RC
2. System detects existing primary membership
3. System checks: State fees already paid? **Yes**
4. System creates `club_memberships` record:
   - `relationship_type: 'associate'`
   - `pays_association_fees: false`
5. Fee calculation:
   - Club Fee: $40 (associate rate)
   - State Fee: $0 (already paid)
   - National Fee: $0 (already paid)
   - **Total: $40**

### Example 3: Member Joins Club in Different State

1. User (NSW primary member) applies to Victorian club
2. System detects different state association
3. System creates `club_memberships` record:
   - `relationship_type: 'associate'`
   - `pays_association_fees: true` (different state!)
4. Fee calculation:
   - Club Fee: $45
   - State Fee: $18 (VIC - different association)
   - National Fee: $0 (already paid at national level)
   - **Total: $63**

## Implementation Notes

### Fixed Issues

1. **Approved members not appearing in members list**
   - Fixed trigger to sync `club_memberships` → `members` table on INSERT
   - Now creates member record automatically when membership is approved

2. **Duplicate key constraint on approval**
   - Changed INSERT to UPSERT for `club_memberships`
   - Handles cases where membership record already exists

3. **Associate member fee detection**
   - Added `should_pay_association_fees()` function
   - Automatically detects existing paid memberships
   - Prevents duplicate association fee charges

### Helper Functions

#### `has_paid_state_fees_this_year(member_id, state_id, year)`
Checks if member has paid state fees in current/specified year.

#### `has_paid_national_fees_this_year(member_id, national_id, year)`
Checks if member has paid national fees in current/specified year.

#### `should_pay_association_fees(member_id, club_id, relationship_type)`
Determines if association fees should be charged for new membership.

## Testing the System

### Test Scenario 1: Approve Application
1. Go to Membership → Applications
2. Approve Demo Stevens application
3. Check Members list - Demo should now appear
4. Verify `club_memberships` and `members` tables are synced

### Test Scenario 2: Multi-Club Membership
1. Have user (existing member) apply to second club
2. System should auto-detect as associate member
3. Verify no state/national fees charged
4. Check `membership_remittances` - should not create duplicate state remittance

## Future Enhancements

1. **UI for joining additional clubs**: Add "Join Another Club" button on member dashboard
2. **Fee comparison widget**: Show members what they'd pay at other clubs
3. **Bulk transfer**: Allow clubs to bulk-add members from other clubs
4. **Association reporting**: Dashboard showing multi-club member statistics
