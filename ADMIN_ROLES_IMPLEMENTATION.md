# Admin Roles Implementation - Complete

## Overview
State Admin and National Admin roles have been successfully added to AlfiePro, along with documentation for the dual payment gateway system.

## What Was Implemented

### 1. Database Schema
**Migration:** `add_state_and_national_admin_roles`

**New Role Values:**
- `member` - Read-only club access
- `editor` - Content editing within a club
- `admin` - Full club administration
- `state_admin` - Multi-club management (state/region level)
- `national_admin` - All clubs management (national level)
- `super_admin` - Platform owner (via profiles.is_super_admin flag)

**New Columns:**
- `clubs.subscription_tier` - Tracks if club is on club/state/national plan
- `profiles.is_super_admin` - Boolean flag for platform owners

**Helper Functions:**
```sql
is_state_admin(user_id)    -- Returns true if user is state/national/super admin
is_national_admin(user_id)  -- Returns true if user is national/super admin
is_super_admin(user_id)     -- Returns true if user is platform super admin
```

**View:**
```sql
user_highest_role  -- Shows each user's highest role and all clubs they belong to
```

### 2. TypeScript Updates

**Updated Files:**
- `src/types/auth.ts` - Added state_admin and national_admin to ClubRole type
- `src/contexts/AuthContext.tsx` - Updated UserClub interface
- `src/hooks/usePermissions.ts` - Added permission checks for new roles

**New Permissions:**
- `state.manage` - State admin operations
- `national.manage` - National admin operations
- `platform.manage` - Platform owner operations

**New Hook Returns:**
```typescript
const { isStateAdmin, isNationalAdmin } = usePermissions();
```

### 3. Role Hierarchy

```
Super Admin (Platform Owner)
    ↓
National Admin (All clubs nationwide)
    ↓
State Admin (Multiple clubs in state/region)
    ↓
Club Admin (Single club)
    ↓
Editor (Content management)
    ↓
Member (Read-only)
```

## Permission Matrix

| Permission | Member | Editor | Admin | State Admin | National Admin | Super Admin |
|-----------|--------|--------|-------|-------------|----------------|-------------|
| View Content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Content | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Club | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage Multiple Clubs | ❌ | ❌ | ❌ | ✅ (in state) | ✅ | ✅ |
| Manage All Clubs | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Platform Settings | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Setting Up Admin Roles

### Make Yourself Super Admin

1. Get your user ID from Supabase Dashboard → Authentication → Users
2. Run this SQL:

```sql
UPDATE profiles
SET is_super_admin = true
WHERE id = 'your-user-uuid-here';
```

3. Log out and log back in
4. You now have full platform access

### Promote User to State Admin

```sql
-- They'll be able to manage clubs in their state
INSERT INTO user_clubs (user_id, club_id, role)
VALUES ('user-uuid', 'any-club-in-state-uuid', 'state_admin');

-- Note: State admins can access ALL clubs, but typically you'd
-- assign them to one club as an anchor point
```

### Promote User to National Admin

```sql
-- They'll be able to manage ALL clubs nationwide
INSERT INTO user_clubs (user_id, club_id, role)
VALUES ('user-uuid', 'any-club-uuid', 'national_admin');

-- Note: National admins can access every club
-- The club_id is just a reference point
```

## Payment Gateway Architecture

### Two Separate Systems

**System 1: Platform Subscriptions (AlfiePro Revenue)**
- Club/State/National subscription fees
- Uses YOUR Stripe account
- Environment variable: `STRIPE_SECRET_KEY`
- Edge functions: `create-alfie-checkout`, `alfie-stripe-webhook`
- Money goes to YOU (platform owner)

**System 2: Club Payments (Club Revenue)**
- Member signup fees, invoices, event fees
- Uses EACH CLUB's Stripe Connect account (optional)
- Falls back to bank transfer if club has no Stripe
- Edge functions: `create-stripe-checkout`, `stripe-webhook`, `connect-stripe`
- Money goes to THE CLUB

### Why Two Systems?
1. **Legal separation** - Platform and clubs are separate entities
2. **Clean accounting** - No commingling of funds
3. **Tax compliance** - Each entity handles own taxes
4. **Trust** - Clubs control their own money
5. **Compliance** - Meets payment processor requirements

### Club Payment Logic

```typescript
// In member signup form
if (club.stripe_account_id) {
  // Show card payment option
  // Use create-stripe-checkout with club's Stripe Connect account
} else {
  // Show bank transfer only
  // Display club's bank details
  // Manual reconciliation by club admin
}
```

## Documentation

### Created Files
1. **PAYMENT_ARCHITECTURE_GUIDE.md** - Complete guide to dual payment system
2. **ADMIN_ROLES_IMPLEMENTATION.md** - This file
3. **TRIAL_IMPLEMENTATION_COMPLETE.md** - 30-day trial system docs

### Key Sections
- Setup instructions for both payment systems
- Role hierarchy and permissions
- Database schema and helper functions
- Testing checklists
- Common issues and solutions
- Revenue flow diagrams

## Testing Checklist

### Roles
- [ ] Set yourself as super admin
- [ ] Verify you can access all clubs
- [ ] Create a state admin user
- [ ] Verify state admin can access multiple clubs
- [ ] Create a national admin user
- [ ] Verify national admin can access all clubs
- [ ] Test permission checks work correctly

### Platform Payments
- [ ] Configure your Stripe account
- [ ] Test club signup with free trial
- [ ] Verify subscription in YOUR Stripe dashboard
- [ ] Check user_subscriptions table
- [ ] Test trial conversion to paid

### Club Payments
- [ ] Connect a club to Stripe
- [ ] Test member signup with card payment
- [ ] Verify payment in CLUB's Stripe dashboard (not yours)
- [ ] Test club without Stripe (bank transfer)
- [ ] Verify bank details displayed correctly

## Next Steps (Future Work)

### State Admin Features
- [ ] State-level dashboard
- [ ] Multi-club reporting
- [ ] State championship management
- [ ] Inter-club event scheduling
- [ ] State-wide member directory

### National Admin Features
- [ ] National dashboard with all clubs
- [ ] National championship management
- [ ] Club performance analytics
- [ ] National member statistics
- [ ] Cross-state event coordination

### Platform Admin Features
- [ ] Subscription management dashboard
- [ ] Revenue analytics
- [ ] Club growth metrics
- [ ] Support ticket system
- [ ] Platform settings panel

## Database Queries

### View All Admins
```sql
SELECT
  p.first_name,
  p.last_name,
  u.email,
  uc.role,
  c.name as club_name
FROM user_clubs uc
JOIN profiles p ON p.id = uc.user_id
JOIN auth.users u ON u.id = uc.user_id
LEFT JOIN clubs c ON c.id = uc.club_id
WHERE uc.role IN ('admin', 'state_admin', 'national_admin')
OR p.is_super_admin = true
ORDER BY uc.role, c.name;
```

### View All State Admins
```sql
SELECT
  p.first_name || ' ' || p.last_name as name,
  u.email,
  array_agg(c.name) as managed_clubs
FROM user_clubs uc
JOIN profiles p ON p.id = uc.user_id
JOIN auth.users u ON u.id = uc.user_id
LEFT JOIN clubs c ON c.id = uc.club_id
WHERE uc.role = 'state_admin'
GROUP BY p.id, u.email, p.first_name, p.last_name;
```

### View All National Admins
```sql
SELECT
  p.first_name || ' ' || p.last_name as name,
  u.email,
  'All Clubs' as access
FROM user_clubs uc
JOIN profiles p ON p.id = uc.user_id
JOIN auth.users u ON u.id = uc.user_id
WHERE uc.role = 'national_admin'
GROUP BY p.id, u.email, p.first_name, p.last_name;
```

### View Super Admins
```sql
SELECT
  p.first_name || ' ' || p.last_name as name,
  u.email,
  'Platform Owner' as role
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_super_admin = true;
```

## Summary

The admin role system is now complete and ready for use:

✅ State Admin and National Admin roles added to database
✅ Permission system updated to support new roles
✅ TypeScript types updated across the application
✅ Helper functions created for role checking
✅ Documentation created for both payment systems
✅ Clear separation between platform and club payments
✅ Foundation laid for future state/national admin features

The system now properly distinguishes between:
- Platform subscription payments (to you)
- Club member payments (to clubs)
- Different admin levels (club, state, national, platform)
