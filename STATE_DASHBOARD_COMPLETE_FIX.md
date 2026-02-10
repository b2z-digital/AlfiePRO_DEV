# State Dashboard Save - Complete Fix ✅

## Issues Fixed

### Issue 1: Constraint Violation
**Error:** "violates check constraint user_dashboard_layouts_one_org_type"

**Cause:** Code was setting both `club_id` AND `state_association_id` simultaneously

**Fix:** Changed context building to prioritize organization type and explicitly set unused IDs to null

### Issue 2: Duplicate Rows
**Error:** "JSON object requested, multiple (or no) rows returned"

**Cause:** Duplicate dashboard layouts existed in the database for the same user/organization

**Fix:**
1. Applied migration to clean up all existing duplicates
2. Added automatic duplicate cleanup before saves
3. Changed `.single()` to `.maybeSingle()` for safer queries

## What Was Applied

### 1. Code Changes in `CustomizableDashboard.tsx`
```typescript
// Now properly sets only ONE organization ID at a time
if (currentOrganization?.type === 'national') {
  context = { clubId: null, stateAssociationId: null, nationalAssociationId: currentOrganization.id };
} else if (currentOrganization?.type === 'state') {
  context = { clubId: null, stateAssociationId: currentOrganization.id, nationalAssociationId: null };
} else {
  context = { clubId: currentClub?.clubId || null, stateAssociationId: null, nationalAssociationId: null };
}
```

### 2. Enhanced `dashboardStorage.ts`
✅ Added `cleanupDuplicateLayouts()` function
✅ Automatic cleanup before every save
✅ Changed `.single()` to `.maybeSingle()` to handle edge cases
✅ Better error handling and logging

### 3. Database Migrations Applied
✅ **Cleanup Migration** - Removed all duplicate layouts, kept newest
✅ **Indexes Migration** - Added performance indexes for state/national queries

## Test Now

### Step 1: Hard Refresh
**Important:** Clear your browser cache or do a hard refresh:
- Chrome/Edge: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Firefox: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)

### Step 2: Test State Dashboard
1. Switch to your State Association view
2. Click Edit mode (pencil icon)
3. Add multiple widgets
4. Click **Save**
5. ✅ Should save successfully now!

### Step 3: Verify Persistence
1. Refresh the page
2. Verify your widgets are still there
3. Try editing again - should work smoothly

## What Should Work Now

✅ **Saving State Association dashboards** - No more constraint violations
✅ **No duplicate layouts** - Database cleaned up, duplicates prevented
✅ **Fast queries** - New indexes improve performance
✅ **Better error messages** - Shows specific issues if any occur
✅ **Automatic cleanup** - Handles edge cases gracefully

## Technical Details

### Database Constraint
```sql
CHECK (
  (club_id IS NOT NULL AND others ARE NULL) OR
  (state_association_id IS NOT NULL AND others ARE NULL) OR
  (national_association_id IS NOT NULL AND others ARE NULL) OR
  (all ARE NULL)
)
```

### Unique Constraint
```sql
UNIQUE (user_id, club_id, state_association_id, national_association_id, is_default)
```

### How Duplicates Are Prevented
1. Before saving, check for existing layouts with same context
2. If multiple found, delete all but the newest
3. Then proceed with update or insert
4. Use `.maybeSingle()` to gracefully handle unexpected results

### New Indexes
- `idx_user_dashboard_layouts_state_assoc` - Fast state dashboard lookups
- `idx_user_dashboard_layouts_national_assoc` - Fast national dashboard lookups
- Partial indexes (only for non-null values) - Optimal performance

## If Still Having Issues

### Check Browser Console (F12)
Look for these log messages:
- `🧹 Cleaning up duplicate layouts`
- `⚠️ Found X duplicate layouts, keeping newest`
- `✅ Deleted X duplicate layouts`
- `💾 Saving dashboard layout`
- `✅ Dashboard layout saved successfully`

### Verify Your State Association
```sql
-- Check your state association exists
SELECT * FROM state_associations WHERE id = 'your-state-id';

-- Check clubs under your state
SELECT COUNT(*) FROM clubs WHERE state_association_id = 'your-state-id';

-- Check your admin permissions
SELECT * FROM user_clubs WHERE user_id = auth.uid() AND role = 'state_admin';
```

### Common Issues

**Still seeing old error?**
→ Hard refresh your browser (Ctrl+Shift+R)

**Widgets not showing data?**
→ Verify clubs exist under your state association

**Save button does nothing?**
→ Check browser console for JavaScript errors

**Getting permission denied?**
→ Verify you have state_admin role

## Success Indicators

When working correctly, you should see:
1. ✅ Green success notification after clicking Save
2. ✅ Layout persists after page refresh
3. ✅ Widgets display aggregated data from all clubs
4. ✅ No console errors
5. ✅ Edit mode works smoothly

## Summary

**Root causes identified and fixed:**
1. ❌ Context building set multiple org IDs → ✅ Fixed: Only sets ONE
2. ❌ Duplicate layouts in database → ✅ Fixed: Cleaned up + prevention
3. ❌ `.single()` failing on unexpected results → ✅ Fixed: Using `.maybeSingle()`

**Database improvements:**
- ✅ Duplicates cleaned up
- ✅ Performance indexes added
- ✅ Constraints properly enforced

**Code improvements:**
- ✅ Proper organization context handling
- ✅ Automatic duplicate prevention
- ✅ Better error handling
- ✅ Comprehensive logging

You're all set! The State Dashboard should now save reliably. 🎉
