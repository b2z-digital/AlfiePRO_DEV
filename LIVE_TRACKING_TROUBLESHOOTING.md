# Live Skipper Tracking - Troubleshooting Guide

## Error: "Failed to initialize live tracking"

This error appears when the QR code modal can't create the tracking event in the database.

### Step 1: Check Browser Console

1. Open browser DevTools (F12 or Right-click → Inspect)
2. Go to the **Console** tab
3. Look for red error messages

You should see detailed logs like:
```
Creating live tracking event for: [event-id] [club-id]
Error creating tracking event: {...}
```

### Common Causes & Solutions:

#### 1. Database Permissions Issue

**Error in console:**
```
new row violates row-level security policy
```

**Solution:**
The RLS policies might be too restrictive. Check that your user has the correct role:

```sql
-- Check your role in the club
SELECT * FROM user_clubs
WHERE user_id = auth.uid()
AND role IN ('admin', 'super_admin', 'editor');
```

If you don't have the right role, you need admin permissions to create live tracking events.

#### 2. Missing Club ID

**Error in console:**
```
null value in column "club_id" violates not-null constraint
```

**Solution:**
The event might not have a club_id, or you're not associated with the club.

Check:
```sql
-- Verify the event has a club_id
SELECT id, name, club_id FROM quick_races WHERE id = '[event-id]';

-- Verify you're in that club
SELECT * FROM user_clubs WHERE user_id = auth.uid();
```

#### 3. Event Doesn't Exist

**Error in console:**
```
Event not found or invalid event ID
```

**Solution:**
The event ID being passed might be wrong. Check the event card is showing the correct data.

#### 4. Supabase Connection Issue

**Error in console:**
```
Failed to fetch
Network error
```

**Solution:**
- Check your internet connection
- Verify Supabase is accessible
- Check `.env` file has correct Supabase credentials
- Try refreshing the page

### Step 2: Verify Database Tables Exist

Check that the live tracking tables were created:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'live_tracking%';
```

You should see:
- `live_tracking_sessions`
- `live_tracking_events`
- `session_skipper_tracking`
- `skipper_notifications_sent`

If tables are missing, run the migration:
```bash
# Check migrations folder
ls supabase/migrations/ | grep live_tracking
```

### Step 3: Check RLS Policies

Verify the policies allow club admins to create tracking events:

```sql
-- Check policies on live_tracking_events table
SELECT * FROM pg_policies
WHERE tablename = 'live_tracking_events';
```

### Step 4: Manual Database Test

Try creating a tracking event manually:

```sql
-- Insert a test tracking event
INSERT INTO live_tracking_events (event_id, club_id, enabled)
VALUES (
  '[your-event-id]',
  '[your-club-id]',
  true
)
RETURNING *;
```

If this fails, check the error message for clues.

### Step 5: Check Event Has Participants

The live tracking system needs registered participants:

```sql
-- Check if event has participants
SELECT COUNT(*) FROM race_participants WHERE race_id = '[event-id]';
```

If count is 0:
1. Go to the event
2. Add skippers/participants
3. Save the event
4. Try live tracking again

## Other Issues

### QR Code Not Displaying (But No Error)

**Symptoms:** Modal opens, stats show 0s, but QR code area is blank

**Solution:**
1. Check console for "QR code generated successfully"
2. If you see the message, it's a display issue
3. Try different browser
4. Check if qrcode package is installed: `npm list qrcode`

### "Copy Link" Button Doesn't Work

**Solution:**
1. Clipboard API might be blocked
2. Must be on HTTPS or localhost
3. Check browser permissions
4. Manually copy the URL from console logs

### Skippers Can't Access Tracking Link

**Symptoms:** Visiting the link shows "Invalid or expired tracking link"

**Causes:**
1. Tracking event wasn't created successfully
2. Access token is wrong
3. Event was deleted

**Check:**
```sql
SELECT * FROM live_tracking_events
WHERE event_id = '[event-id]'
AND enabled = true;
```

### No Skippers Show on Selection Page

**Cause:** Event has no participants

**Solution:**
1. Go to Race Management
2. Edit the event
3. Add participants/skippers
4. Save
5. Refresh tracking link

### Dashboard Won't Load After Selection

**Causes:**
1. Session creation failed
2. No network connection
3. Database permissions issue

**Check Console:**
Look for errors in:
- `createTrackingSession`
- `getCurrentTrackingSession`
- `loadDashboardData`

### Notifications Not Working

**Expected:** This is normal for now!

Web Push notifications require:
1. Edge Function to send notifications (not deployed yet)
2. VAPID keys configured
3. Service Worker registered

The notification PERMISSION can be granted, but actual push delivery requires the Edge Function.

## Getting Help

If you're still stuck:

1. **Collect Information:**
   - Browser console logs (full output)
   - Network tab showing failed requests
   - Event ID and Club ID
   - Your user role in the club
   - Any error messages

2. **Check Database:**
   - Run the verification queries above
   - Export results

3. **Provide Details:**
   - What action triggered the error
   - What you expected to happen
   - What actually happened
   - Steps to reproduce

## Quick Fixes

### Reset Everything and Start Fresh

```sql
-- Delete all tracking data for an event
DELETE FROM live_tracking_sessions WHERE event_id = '[event-id]';
DELETE FROM live_tracking_events WHERE event_id = '[event-id]';
```

Then try creating the QR code again.

### Clear Browser Cache

```
1. Open DevTools (F12)
2. Right-click the refresh button
3. Click "Empty Cache and Hard Reload"
```

### Test in Incognito Mode

This eliminates cached data and extension interference.

## Success Checklist

✅ Tables exist in database
✅ User has admin/editor role in club
✅ Event has club_id set
✅ Event has participants added
✅ Browser console shows no errors
✅ QR code displays in modal
✅ Copy link button works
✅ Visiting link shows selection page
✅ Selection page shows skippers list
✅ Can select a skipper
✅ Dashboard loads after selection

---

If all checklist items pass, the system is working correctly!
