# State Dashboard Save - FIXED! ✅

## The Problem

Error: **"new row for relation "user_dashboard_layouts" violates check constraint "user_dashboard_layouts_one_org_type"**

## Root Cause

The database has a constraint that ensures **only ONE** of these can be set at a time:
- `club_id`
- `state_association_id`
- `national_association_id`

The code was incorrectly setting BOTH `club_id` AND `state_association_id` when viewing as a State Association, violating this constraint.

### Why This Happened

When you switch to State Association view:
- `currentClub?.clubId` was still set (your last viewed club)
- `currentOrganization?.type === 'state'` was true
- **Both were being sent to the database** ❌

## The Fix

Changed the context building logic to **prioritize organization type**:

```typescript
// BEFORE (Wrong - could set multiple IDs):
const context = {
  clubId: currentClub?.clubId || null,
  stateAssociationId: currentOrganization?.type === 'state' ? currentOrganization.id : null,
  nationalAssociationId: currentOrganization?.type === 'national' ? currentOrganization.id : null
};

// AFTER (Correct - only sets ONE ID):
let context;
if (currentOrganization?.type === 'national') {
  context = {
    clubId: null,
    stateAssociationId: null,
    nationalAssociationId: currentOrganization.id
  };
} else if (currentOrganization?.type === 'state') {
  context = {
    clubId: null,
    stateAssociationId: currentOrganization.id,
    nationalAssociationId: null
  };
} else {
  context = {
    clubId: currentClub?.clubId || null,
    stateAssociationId: null,
    nationalAssociationId: null
  };
}
```

## What Changed

✅ **Fixed in 3 places** in `CustomizableDashboard.tsx`:
1. `loadLayout()` - Loading dashboards
2. `saveLayout()` - Saving dashboards
3. `handleResetLayout()` - Resetting dashboards

## Test Now

1. Switch to your State Association view
2. Click Edit mode (pencil icon)
3. Add widgets
4. Click **Save**
5. ✅ Should work now!

## Expected Behavior

### When Viewing as State Association:
- **Only** `state_association_id` is set
- `club_id` is explicitly set to `null`
- Dashboard saves successfully
- Widgets show aggregated state-wide data

### When Viewing as Club:
- **Only** `club_id` is set
- `state_association_id` is explicitly set to `null`
- Dashboard saves successfully
- Widgets show single club data

### When Viewing as National Association:
- **Only** `national_association_id` is set
- Both `club_id` and `state_association_id` are set to `null`
- Dashboard saves successfully
- Widgets show nationwide data

## Why This Fix Works

The database constraint `user_dashboard_layouts_one_org_type` requires:

```sql
CHECK (
  (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL) OR
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL)
)
```

Our fix ensures we **always match one of these patterns** by:
1. Checking organization type FIRST
2. Setting the appropriate ID
3. Explicitly setting others to `null`

## Build Status

✅ **Build completed successfully** - All code compiles without errors

## You're Good to Go!

The State Association dashboard should now save without any constraint violations. The fix ensures only the correct organization ID is set based on your current view context.
