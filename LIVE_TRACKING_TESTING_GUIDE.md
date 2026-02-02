# Live Skipper Tracking - Testing Guide

## ✅ System Status

**All components are fully built and integrated:**

1. ✅ Database schema (4 tables with RLS)
2. ✅ QR Code generation modal
3. ✅ Guest skipper selection page
4. ✅ Live dashboard with real-time updates
5. ✅ Push notification system
6. ✅ Routes configured in App.tsx

## 🧪 How to Test

### Step 1: Create a Test Event

1. Log into AlfiePRO
2. Go to **Race Management** page
3. Create a new quick race event:
   - Name: "Test Live Tracking Event"
   - Date: Today's date
   - Add at least 5-10 registered skippers

### Step 2: Generate QR Code

1. On the Race Management page, find your test event card
2. **Hover over the event card** - you should see action buttons appear
3. Click the **blue QR code icon** (first button)
4. The Live Skipper Tracking modal should open

**What you should see:**
- Modal with title "Live Skipper Tracking"
- 4 statistics boxes showing engagement metrics (all 0s initially)
- QR Code displayed in the center-left
- Action buttons: "QR Code", "Poster", "Copy Link", "Share"
- Instructions on how it works
- List of automatic notifications
- Supported race formats

### Step 3: Test the QR Code

**Option A: Click "Copy Link"**
1. Click the gray "Copy Link" button
2. Open a new browser tab (or incognito window)
3. Paste the URL (should be like: `http://localhost:5173/live/abc123...`)
4. Press Enter

**Option B: Download QR Code**
1. Click blue "QR Code" button to download the QR code image
2. Open the image on your phone
3. Scan it with your phone's camera app
4. Tap the notification to open the link

### Step 4: Guest Skipper Selection Page

**What you should see:**
- Clean, modern page with gradient background
- Event header showing:
  - Event name
  - Date
  - Venue
  - Race class
- Search box to find skippers
- List of all registered skippers with:
  - Name
  - Sail number
  - Boat class (if available)
  - Clickable cards
- "Start Live Tracking" button appears when you select a skipper
- Sign-in prompt at bottom for enhanced features

**Test it:**
1. Search for a skipper by name or sail number
2. Click on a skipper card (should highlight in blue)
3. Click "Start Live Tracking" button
4. Should redirect to dashboard

### Step 5: Live Dashboard

**What you should see:**
- Blue header with:
  - Sailboat icon
  - Your skipper name and sail number
  - Refresh, Settings, and Logout buttons
- Event information (date, venue, format)
- Notification permission banner (if not enabled)
- Current Status card showing:
  - Position (trophy icon)
  - Points (score)
  - Races completed
- Overall Standings leaderboard
  - Your position highlighted in blue
  - Top 10 positions shown
  - Gold/Silver/Bronze badges for top 3
- "Create Free Account" call-to-action banner

**Test it:**
1. Should show your selected skipper's information
2. Click "Enable Notifications" banner
3. Allow notifications when browser prompts
4. Click refresh button to reload data
5. Click logout to return to selection page

### Step 6: Test Real-Time Updates (If Event Has Results)

If you've entered race results for the event:
1. The dashboard should update automatically
2. Standings should reflect current positions
3. Points should be accurate
4. Any promotion/relegation badges should appear

## 🐛 Troubleshooting

### QR Code Not Showing

**Check browser console for errors:**
```
Right-click → Inspect → Console tab
```

Look for:
- "Creating live tracking event for: [eventId]"
- "Live tracking event created: [object]"
- "Generating QR code for URL: http://..."
- "QR code generated successfully"

**If you see errors:**
- Check that the event has a valid ID
- Verify you have club permissions
- Check database connection

### "Invalid or expired tracking link"

This means:
- The access token is wrong
- The live_tracking_events table entry wasn't created
- Check the database: `SELECT * FROM live_tracking_events;`

### No Skippers Showing on Selection Page

This means the event has no registered participants:
1. Go back to the event
2. Click "Edit Event" or "Start Scoring"
3. Add skippers/participants
4. Save the event
5. Try the QR code again

### Dashboard Not Loading

**Check:**
- Browser console for errors
- Network tab (F12 → Network) for failed requests
- That you selected a valid skipper
- Event has race_participants entries in database

## 📊 Database Verification

To verify everything is working, check these tables:

```sql
-- Check if tracking event was created
SELECT * FROM live_tracking_events WHERE event_id = '[your-event-id]';

-- Check if session was created
SELECT * FROM live_tracking_sessions WHERE event_id = '[your-event-id]';

-- Check if tracking status was created
SELECT * FROM session_skipper_tracking WHERE event_id = '[your-event-id]';
```

## 🎯 What Should Work

### ✅ Fully Implemented
- QR code generation and display
- Downloadable QR code images
- Downloadable poster with instructions
- Copy link to clipboard
- Share via Web Share API
- Guest skipper selection with search
- Session creation for guests
- Live dashboard with real-time data
- Notification permission requests
- Browser notification support
- Real-time standings display
- Position tracking
- Points accumulation
- Account creation prompts
- Session persistence across page reloads
- Auto-login for returning users
- Logout functionality

### 🔄 Requires Race Results to Test
- Real-time position updates
- Points changes notifications
- Promotion/relegation alerts (HMS)
- Handicap update notifications
- Race start countdown notifications

### 📡 Requires Edge Function (Future)
- Actual push notification delivery
- Background notification sync
- Notification retry logic

## 🚀 Next Steps After Testing

Once you've verified the core functionality:

1. **Test with real participants** at a practice event
2. **Gather feedback** on UX and notification timing
3. **Create Edge Function** for production push notifications
4. **Configure VAPID keys** for Web Push
5. **Add notification scheduling** logic
6. **Test on various devices** (iOS, Android, desktop)
7. **Monitor engagement metrics** in production

## 📱 Mobile Testing

To test on mobile:
1. Ensure your dev server is accessible on local network
2. Get your computer's local IP (e.g., 192.168.1.100)
3. Access: `http://192.168.1.100:5173/live/[token]`
4. OR use a QR code generator to create a code with your local URL
5. Scan with phone to test mobile experience

## 💡 Tips

- Test in incognito mode to simulate guest users
- Test with multiple browser tabs to simulate multiple skippers
- Check the Network tab to see Supabase Realtime connections
- Look for WebSocket connections (wss://) in Network tab
- Test notification permissions in different browsers
- Clear localStorage to reset session and test fresh

## ✨ Success Indicators

You'll know it's working when:
- ✅ QR code displays immediately in modal
- ✅ Copy link button works
- ✅ Pasting link opens guest selection page
- ✅ Skippers list populates from event participants
- ✅ Selecting a skipper enables "Start Tracking" button
- ✅ Dashboard loads with skipper's information
- ✅ Standings show correctly
- ✅ Refresh button updates data
- ✅ Logout returns to selection page
- ✅ Notification permission request appears
- ✅ Session persists when closing/reopening browser

---

**Status**: All screens and functionality are built and ready to test!

If you encounter any issues during testing, check:
1. Browser console for JavaScript errors
2. Network tab for failed API calls
3. Database for missing entries
4. Supabase Realtime connection status
