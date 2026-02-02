# Offline Data Caching Guide

## Overview

AlfiePRO now features **automatic data caching** for complete offline functionality. When you're online, the app continuously caches your club's data in the browser's IndexedDB. When you go offline, all cached data remains accessible, and any changes you make are queued to sync when you're back online.

## How It Works

### 1. Automatic Data Preloading (Online)

When you open the app with an internet connection:

- **Immediate Preload**: The app automatically downloads and caches essential data:
  - All race events (last 6 months)
  - All race series
  - Complete member list
  - Recent news articles (last 50)
  - Active tasks
  - Recent meetings (last 20)

- **Background Refresh**: Data refreshes every 5 minutes while you're online
- **Smart Updates**: Only changed data is re-cached, minimizing bandwidth

### 2. Offline Access

When you lose internet connection or enable airplane mode:

- **Instant Access**: All previously cached data loads immediately
- **Full Functionality**: You can:
  - View all race results and standings
  - Score races and record results
  - View member information
  - Read news articles
  - Check tasks and meetings

- **Local Changes**: Any edits are saved locally and queued for sync

### 3. Automatic Sync (Back Online)

When connection is restored:

- **Auto-Sync**: All queued changes upload automatically
- **Conflict Resolution**: Server data always wins for conflicts
- **Progress Tracking**: Visual indicator shows sync status

## What Gets Cached

### Always Cached
✅ All race events for your club
✅ All race series for your club
✅ Complete member directory
✅ Recent news articles (last 50)
✅ Your active tasks
✅ Recent meetings (last 20)
✅ Venue information

### Not Cached
❌ High-resolution images (only thumbnails)
❌ Large file attachments
❌ Video content
❌ Real-time notifications
❌ Live chat messages

## Storage Requirements

Typical storage usage per club:
- **Small Club** (20-50 members): ~2-5 MB
- **Medium Club** (50-200 members): ~5-15 MB
- **Large Club** (200+ members): ~15-50 MB

Most modern browsers allow 50-100 MB of IndexedDB storage per site.

## Checking Cached Data

### From the UI

1. Look for the connection indicator in the top-right corner:
   - **Green**: Online & all data synced
   - **Blue**: Currently syncing
   - **Orange**: Pending changes to sync
   - **Yellow**: Offline mode

2. Click the indicator to see:
   - Connection status
   - Number of pending changes
   - Last sync time
   - Manual sync button

### From Browser DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** > **alfie_pro_offline**
4. View cached data in each store:
   - `events` - Race events
   - `series` - Race series
   - `members` - Member data
   - `articles` - News articles
   - `tasks` - Task list
   - `meetings` - Meeting records
   - `sync_queue` - Pending changes

## Manual Cache Management

### Force Refresh Cache

If you need to force a fresh download:

```javascript
// Open browser console and run:
localStorage.removeItem('lastCacheTime');
location.reload();
```

### Clear All Cached Data

To clear all offline data (use with caution):

```javascript
// Open browser console and run:
const dbRequest = indexedDB.deleteDatabase('alfie_pro_offline');
dbRequest.onsuccess = () => {
  console.log('Cache cleared');
  location.reload();
};
```

## Offline Mode Features

### What Works Offline

| Feature | Offline Support | Notes |
|---------|----------------|-------|
| **Race Scoring** | ✅ Full | All changes sync when online |
| **View Results** | ✅ Full | Shows all cached races |
| **Member Directory** | ✅ Full | Search works offline |
| **Race Calendar** | ✅ Full | View all scheduled races |
| **News Articles** | ✅ Limited | Last 50 articles only |
| **Create Race** | ✅ Full | Syncs when online |
| **Edit Member** | ✅ Full | Syncs when online |
| **Upload Media** | ❌ Requires online | Files need network |
| **Send Notifications** | ❌ Requires online | Real-time feature |
| **Generate Reports** | ✅ Full | Uses cached data |

### Sync Queue

When offline, changes are queued:

1. **Race Results**: All scoring changes
2. **Member Updates**: Profile edits
3. **Task Updates**: Status changes
4. **New Records**: Created races, members, etc.

Each queued item:
- Retries automatically when online
- Shows in the sync counter
- Persists across app restarts
- Auto-removes after successful sync

## Best Practices

### For Race Officers

1. **Pre-Cache Before Racing**
   - Open the app 5 minutes before racing
   - Let it fully load while on WiFi/4G
   - Check the green "Online & Synced" indicator

2. **During Racing**
   - Work normally - offline mode is automatic
   - Score races as usual
   - Don't worry about connection drops

3. **After Racing**
   - Connect to internet when convenient
   - Changes sync automatically
   - Verify sync counter shows "0 pending"

### For Administrators

1. **Regular Data Updates**
   - Update member list regularly
   - Keep race schedule current
   - Archive old races to reduce cache size

2. **Monitor Sync Status**
   - Check pending sync counts
   - Clear failed syncs if needed
   - Verify member devices have space

3. **Educate Users**
   - Show members how to check cache status
   - Explain the offline indicator colors
   - Demonstrate manual sync button

## Troubleshooting

### "No data showing offline"

**Cause**: Data never cached while online

**Fix**:
1. Connect to internet
2. Open the app and navigate through sections
3. Wait 30 seconds for automatic caching
4. Check sync indicator shows "Online & Synced"
5. Test offline mode by enabling airplane mode

### "Changes not syncing"

**Cause**: Sync queue stuck or network issue

**Fix**:
1. Check connection indicator
2. Click indicator and press "Sync Now"
3. Check browser console for errors
4. If persistent, clear sync queue:
   ```javascript
   // In browser console:
   offlineStorage.clearFailedSyncItems();
   ```

### "App slow when offline"

**Cause**: Large cache or low device memory

**Fix**:
1. Close other browser tabs
2. Clear old cached data
3. Archive old races in the app
4. Increase browser storage limit

### "Conflict errors after sync"

**Cause**: Data changed on server while offline

**Fix**:
- Server version always wins
- Your offline changes are logged
- Re-apply changes if needed
- This is normal and expected behavior

## Technical Details

### Cache Strategy

- **Network First**: Try server, fallback to cache
- **Cache Then Network**: Show cache, update from server
- **Cache Only**: When offline, serve from IndexedDB

### Data Freshness

- **Events/Series**: Refresh every 5 minutes
- **Members**: Refresh every 5 minutes
- **Articles**: Refresh every 10 minutes
- **Tasks**: Refresh every 5 minutes

### Sync Behavior

- **Retry Logic**: 3 attempts with exponential backoff
- **Batch Syncing**: Multiple changes sent together
- **Priority Queue**: Critical data syncs first
- **Failure Handling**: Failed items remain queued

## Future Enhancements

Coming soon:
- [ ] Selective cache (choose what to cache)
- [ ] Cache size indicator
- [ ] Export/import cache for backup
- [ ] Offline image thumbnails
- [ ] Differential sync (only changes)
- [ ] Background sync API integration
- [ ] Service Worker update notifications

## Support

For issues with offline functionality:

1. Check this guide first
2. Clear cache and retry
3. Check browser compatibility (Chrome, Edge, Safari, Firefox)
4. Report persistent issues with:
   - Browser version
   - Device type
   - Error messages from console
   - Steps to reproduce

---

**Last Updated**: 2025-10-23
**Version**: 2.0.0
