# Offline Mode Guide - AlfiePRO

## Overview

AlfiePRO now supports **full offline functionality** for race officers and club administrators. This means you can create events, add skippers, score races, and manage member data even without an internet connection. All changes are automatically synced when connectivity is restored.

## Key Features

### What Works Offline

✅ **Event Creation**
- Create new race events
- Configure event settings (multi-day, heat racing, etc.)
- Set dates, venues, and race formats

✅ **Skipper Management**
- Add skippers to events (even at the venue without internet)
- Import from member list (cached data)
- Manual entry of skippers
- Update handicaps and skipper details

✅ **Race Scoring**
- Enter race results for all formats (handicap, scratch, heat racing)
- Complete multi-day events
- Calculate standings and points
- View performance graphs and analytics

✅ **Member Data Access**
- Search cached members
- View member profiles
- Access member lists for skipper selection

✅ **Series Management**
- Create and manage race series
- Score series rounds
- View series leaderboards

### What Requires Internet

❌ **Initial Setup**
- First-time login and authentication
- Initial data caching (members, clubs)
- Account creation and club registration

❌ **Media Uploads**
- Uploading photos and videos
- Livestream setup

❌ **Email Notifications**
- Sending race reports
- Member invitations

❌ **Real-time Features**
- Live leaderboards for spectators
- Multi-user concurrent scoring

## How It Works

### Architecture

```
┌─────────────────────────────────────────────┐
│              Your Device                     │
│  ┌────────────────────────────────┐         │
│  │      AlfiePRO App              │         │
│  │  (Race Scoring Interface)      │         │
│  └────────────────────────────────┘         │
│              ↕                               │
│  ┌────────────────────────────────┐         │
│  │     IndexedDB Storage          │         │
│  │  • Events                      │         │
│  │  • Skippers                    │         │
│  │  • Race Results                │         │
│  │  • Member Cache                │         │
│  │  • Pending Changes Queue       │         │
│  └────────────────────────────────┘         │
└─────────────────────────────────────────────┘
              ↕ (When Online)
┌─────────────────────────────────────────────┐
│         Supabase Cloud Database             │
│       (Source of Truth - Synced)            │
└─────────────────────────────────────────────┘
```

### Offline-First Design

1. **All operations write to local storage FIRST**
   - Instant response, no waiting for network
   - Data is never lost due to connectivity issues

2. **Background sync queue**
   - All changes are queued for upload
   - Automatic retry with exponential backoff
   - Manual sync option available

3. **Smart caching**
   - Members and club data cached for 24 hours
   - Events and results cached indefinitely
   - Automatic refresh when online

## Usage Instructions

### Before Going to the Venue (Online)

1. **Log in to AlfiePRO**
   - The app will automatically cache your club's member data
   - This ensures you can select skippers later without internet

2. **Pre-create Events (Optional)**
   - Create event ahead of time with basic details
   - Can be done online or offline

3. **Check Sync Status**
   - Look for the **sync indicator** in the bottom left of the sidebar
   - Green "Online & Synced" = ready to go offline
   - Any pending changes should sync before you leave

### At the Venue (Offline)

1. **Check Connection Status**
   - Indicator shows "Offline Mode" = working offline
   - Yellow badge = changes are being saved locally

2. **Create Event (if not pre-created)**
   - Click "New Event"
   - Fill in all details (date, venue, format, etc.)
   - Event is saved locally

3. **Add Skippers**
   - Click "Manage Skippers" when scoring
   - Search cached members or add manually
   - All changes saved locally

4. **Score Races**
   - Enter results as normal
   - All results auto-saved locally every few seconds
   - Continue scoring without worrying about connectivity

5. **View the Pending Sync Counter**
   - Shows how many changes are waiting to upload
   - Don't worry - they're safely stored!

### After Returning Online

1. **Automatic Sync**
   - App detects connection automatically
   - Starts syncing pending changes immediately
   - Sync indicator shows "Syncing..." with progress

2. **Manual Sync (if needed)**
   - Click the sync indicator
   - Click "Sync Now" button
   - Watch progress in real-time

3. **Verify Sync Complete**
   - Indicator shows "Online & Synced"
   - Pending count = 0
   - All data now backed up to cloud

## Understanding the Sync Indicator

### Status Colors & Meanings

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Online & Synced | Connected + all changes uploaded |
| 🟡 Yellow | Offline Mode | No connection, changes saved locally |
| 🔵 Blue | Syncing... | Currently uploading changes |
| 🟠 Orange | Pending Changes | Online but changes not yet synced |
| 🔴 Red | Sync Failed | Retry needed (rare) |

### Sync Indicator Details

Click the sync indicator to see:
- Connection status (Online/Offline)
- Number of pending changes
- Last successful sync time
- Manual sync button (when online)
- Helpful explanations

## Data Safety & Reliability

### How We Protect Your Data

1. **Multiple Layers of Storage**
   - IndexedDB (primary offline storage, 50MB+)
   - localStorage (backup for current event)
   - Supabase cloud (when online)

2. **Automatic Saves**
   - Race results saved every few seconds
   - No "Save" button needed
   - Works even if browser closes

3. **Conflict Resolution**
   - Last-write-wins for event data
   - Timestamps ensure latest version wins
   - Manual intervention only if really needed

4. **Retry Logic**
   - Failed syncs retry automatically (3 attempts)
   - Exponential backoff prevents server overload
   - Manual retry always available

### When Can Data Be Lost?

Data loss is **extremely rare** but can occur in these scenarios:

❌ **Browser Data Cleared**
- If you manually clear browser data before syncing
- Solution: Don't clear browser data until you see "Online & Synced"

❌ **IndexedDB Corruption** (Very Rare)
- Browser crash or storage corruption
- Solution: Modern browsers are very reliable

❌ **Device Failure**
- Device damaged or stolen before sync
- Solution: Sync as soon as you have internet

### Best Practices

✅ **Do This:**
- Check for "Online & Synced" before leaving venue
- Let app sync in background when you have internet
- Keep app open until pending changes = 0
- Use a reliable device with good battery

❌ **Avoid This:**
- Don't clear browser data if you have pending changes
- Don't close browser immediately after scoring
- Don't use incognito/private mode (won't persist)

## Technical Details

### Storage Capacity

- **IndexedDB**: 50MB - 100MB+ (depends on browser)
- **Typical Event Size**:
  - Simple event: ~50KB
  - Event with 30 skippers, 12 races: ~200KB
  - Can store 250-500+ events offline

### Browser Support

| Browser | Offline Support | Notes |
|---------|----------------|-------|
| Chrome | ✅ Full | Recommended |
| Safari | ✅ Full | iOS/macOS |
| Edge | ✅ Full | Windows recommended |
| Firefox | ✅ Full | All platforms |

### Sync Performance

- **Single Event**: ~0.5 seconds
- **10 Events**: ~2-3 seconds
- **100 Member Cache**: ~1 second

## Troubleshooting

### Problem: Sync indicator stuck on "Syncing..."

**Solution:**
1. Wait 30 seconds (large events take time)
2. Check internet connection
3. Click indicator → "Sync Now" to retry
4. If still stuck, refresh page (data is safe)

### Problem: "Offline Mode" but I have internet

**Solution:**
1. Check your actual internet (try loading another website)
2. Supabase may be temporarily down
3. Your changes are safe - sync will happen automatically
4. Try manual sync after a minute

### Problem: Pending changes not decreasing

**Solution:**
1. Check browser console for errors (F12)
2. Verify you're logged in
3. Try manual sync
4. Contact support if persists (data is safe)

### Problem: Can't find members when offline

**Solution:**
1. Members must be cached BEFORE going offline
2. Next time: Log in while online first
3. Workaround: Add skippers manually by typing names

### Problem: App says "No current event found"

**Solution:**
1. Event might not have saved before going offline
2. Check Dashboard → should see the event listed
3. Click the event to resume scoring
4. If missing: Create new event (offline-capable)

## FAQ

### Q: How long does cached data last?

A: **Indefinitely** for events and results. Member cache recommended to refresh every 24 hours, but older cache still works offline.

### Q: Can multiple race officers score simultaneously offline?

A: **No** - offline mode is single-user. For multi-user scoring, all officers need to be online. Offline mode is for **one race officer at one venue**.

### Q: What happens if I score the same event on two devices offline?

A: The **last device to sync wins**. Avoid scoring the same event on multiple devices when offline. If you must, decide which device has the "real" results and sync that one first.

### Q: Can I delete events while offline?

A: **Yes** - deletion is queued like other operations. The event will be deleted from the cloud when you sync.

### Q: Does offline mode work on mobile phones?

A: **Yes** - fully supported on mobile browsers (Safari iOS, Chrome Android). Consider using a tablet or laptop for better screen size during race scoring.

### Q: How do I force a full re-sync?

A: Click the sync indicator → Details → there's advanced options for clearing cache and re-downloading everything (when online).

### Q: What about photos and media?

A: Media uploads **require internet**. You can add photos later when online - they'll be linked to the event.

## Support

If you encounter issues with offline mode:

1. **Check this guide first** - most issues are covered
2. **Browser Console** - Press F12, look for errors in Console tab
3. **Sync Status** - Click indicator for detailed information
4. **Contact Support** - Include sync status details and any error messages

**Remember:** Your data is safe in IndexedDB even if you see errors. Don't panic - we can always recover it!

---

## Summary

🎯 **Key Takeaway**: AlfiePRO is designed for race officers who need to score races in areas with poor or no internet connectivity. The app works **completely offline** and syncs automatically when you're back online.

**The Offline-First Promise:**
- ✅ Never lose race data due to connectivity
- ✅ Score races at any venue, any time
- ✅ No waiting for slow connections
- ✅ Automatic sync when possible
- ✅ Always know your sync status

Happy Scoring! ⛵
