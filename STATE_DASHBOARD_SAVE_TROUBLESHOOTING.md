# State Dashboard Save Issue - Troubleshooting Guide

## Issue
Getting "Failed to save dashboard layout" error when saving State Association dashboard.

## ✅ What I've Fixed

### 1. Enhanced Error Reporting
Updated the error notification to show the actual error message instead of just "Failed to save dashboard layout".

### 2. Added Missing Database Indexes
Created migration `20260209000000_fix_dashboard_layouts_association_indexes.sql` to add indexes for faster queries on state/national association dashboards.

### 3. Verified RLS Policies
Confirmed that Row Level Security policies are correct and allow users to save their own dashboard layouts for any organization type.

## 🔍 How to Debug

### Step 1: Check Browser Console
1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Try saving your dashboard again
4. Look for error messages starting with:
   - `❌ Layout save failed:`
   - `❌ Error updating dashboard layout:`
   - `❌ Error inserting dashboard layout:`

### Step 2: Check Network Tab
1. Open Developer Tools (F12)
2. Go to Network tab
3. Filter by "Fetch/XHR"
4. Try saving again
5. Look for failed requests to Supabase
6. Check the response body for specific error messages

### Step 3: Verify Organization Context
In the Console, type:
```javascript
console.log('Current Organization:', window.location.href);
```

This will help verify you're viewing as a State Association.

## 🔧 Common Issues & Solutions

### Issue 1: Missing Organization Context
**Symptom:** Error mentions "club_id cannot be null"
**Solution:** Ensure you're properly switched to State Association view

### Issue 2: RLS Policy Blocking Save
**Symptom:** Error mentions "permission denied" or "row-level security"
**Solution:** Run this SQL in your Supabase SQL Editor:
```sql
-- Check current policies
SELECT * FROM pg_policies
WHERE tablename = 'user_dashboard_layouts';

-- Verify you can insert
SELECT auth.uid();
```

### Issue 3: Constraint Violation
**Symptom:** Error mentions "unique constraint" or "check constraint"
**Solution:** The unique constraint requires only ONE of:
- club_id
- state_association_id
- national_association_id

to be set at a time.

## 🚀 Testing the Fix

### Test 1: Simple Dashboard
1. Switch to your State Association view
2. Click edit mode (pencil icon)
3. Add just ONE widget (e.g., "Members Count")
4. Click Save
5. Check for success message

### Test 2: Complex Dashboard
1. Add multiple widgets
2. Arrange in different rows
3. Save
4. Refresh page
5. Verify layout persists

## 📊 What Should Work Now

✅ Saving State Association dashboards
✅ Widgets showing aggregated data across clubs
✅ Better error messages showing actual problems
✅ Faster queries with new indexes

## 🆘 If Still Not Working

### Check These:

1. **Are you logged in?**
   - Dashboard saves require authentication

2. **Do you have State Admin permissions?**
   - Check your role in the State Association

3. **Is your state association properly set up?**
   ```sql
   SELECT * FROM state_associations
   WHERE id = 'your-state-association-id';
   ```

4. **Are there any clubs under your state?**
   ```sql
   SELECT COUNT(*) FROM clubs
   WHERE state_association_id = 'your-state-association-id';
   ```

## 📝 Next Steps

1. **Deploy the migration:**
   The new migration adds indexes for better performance

2. **Test the enhanced error messages:**
   Try saving again - you should now see specific error details

3. **Check browser console:**
   Look for detailed error logs that will help identify the exact issue

4. **Share the console error:**
   If still failing, share the exact error from the console for more targeted help

## 🎯 Expected Behavior

After the fix, when you save a State Association dashboard:

1. You see a "Saving..." indicator
2. Within 1-2 seconds, either:
   - ✅ Success: "Dashboard layout saved successfully"
   - ❌ Error: "Failed to save dashboard layout: [specific error message]"
3. The layout persists across page refreshes
4. Widgets show aggregated data from all clubs

## 💡 Tips

- Start with fewer widgets if having issues
- Try saving after each widget addition to isolate problems
- Check that your state has clubs associated with it
- Ensure your user account has proper permissions
