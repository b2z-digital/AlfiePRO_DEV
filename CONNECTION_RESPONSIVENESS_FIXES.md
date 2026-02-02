# Connection Responsiveness Fixes

## Issues Identified

1. **False "Using Cached Data" warnings** - Connection monitor showing offline warnings even when online
2. **Infinite loading states** - Pages getting stuck on "Loading events..." without recovering
3. **Aggressive timeouts** - 3-second timeouts causing unnecessary fallbacks to cached data

## Fixes Applied

### 1. Connection Monitor (ConnectionMonitor.tsx)

**Problem:** The connection monitor was triggering unnecessarily and showing false offline warnings.

**Solution:**
- Added `wasOffline` state to track if we were actually offline before showing reconnection messages
- Only show "Using Cached Data" banner when truly offline (not just on transient connection issues)
- Separated browser `online/offline` events from offline storage connection changes
- Reconnection messages now only appear after an actual offline period

**Key Changes:**
```typescript
// Only show reconnected message if we were actually offline
if (previouslyOffline && wasOffline) {
  setShowReconnected(true);
  // ... sync logic
}
```

### 2. Race Management Page (RaceManagementPage.tsx)

**Problem:** Queries timing out too quickly and pages stuck in loading state.

**Solution:**
- Increased main data fetch timeout from 10s to 30s
- Increased enrichment timeouts from 5s to 10s each
- Added explicit fallback to base data on enrichment timeouts
- Only show cached data banner when actually offline (not on query timeouts)
- Better error messages distinguishing between offline and query failures

**Key Changes:**
```typescript
// Main query timeout increased
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Request timed out')), 30000)
);

// Only use cached data when truly offline
if (!navigator.onLine) {
  // Use cached data
} else {
  // Show error - don't fallback to cache
}
```

### 3. Supabase Query Retry (supabase.ts)

**Problem:** Retry logic could hang indefinitely without timeout protection.

**Solution:**
- Added 15-second timeout wrapper around each query attempt
- Implemented exponential backoff (1s, 2s, 4s) instead of linear delays
- Better logging to track retry attempts and failures
- Added timeout as a recognized connection error type

**Key Changes:**
```typescript
// Add timeout to prevent hanging queries
const queryPromise = queryFn();
const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) =>
  setTimeout(() => reject(new Error('Query timeout')), 15000)
);

const result = await Promise.race([queryPromise, timeoutPromise]);

// Exponential backoff
const backoffDelay = delay * Math.pow(2, i);
```

### 4. Race Storage (raceStorage.ts)

**Problem:** Very aggressive 3-second timeouts causing unnecessary cache fallbacks.

**Solution:**
- Increased Supabase query timeouts from 3s to 15s
- This allows queries more time to complete in slower network conditions
- Still has timeout protection to prevent infinite hangs

**Key Changes:**
```typescript
// Events query
const { data, error } = await withTimeout(supabaseQuery, 15000);

// Series query
const { data, error } = await withTimeout(seriesQuery, 15000);
```

## Expected Behavior After Fixes

### When Online with Good Connection:
- No offline indicators shown
- Pages load normally within 5-10 seconds
- No cached data warnings

### When Online with Slow Connection:
- Pages have up to 30 seconds to complete initial load
- Enrichment operations have 10 seconds each
- If enrichment times out, base data still displays
- No false offline warnings

### When Actually Offline:
- Yellow "Working Offline" banner appears
- Cached data loads immediately from IndexedDB
- Changes queue for sync when connection returns

### When Connection Restored:
- Green "Connection Restored" banner appears briefly (3 seconds)
- Background sync processes queued changes
- Banner disappears automatically

## Testing Recommendations

1. **Good Connection Test:**
   - Navigate to Race Management page
   - Should load within 5-10 seconds
   - No offline warnings should appear

2. **Slow Connection Test:**
   - Throttle network to "Slow 3G" in DevTools
   - Navigate to Race Management page
   - Should still load (may take 20-30 seconds)
   - Should not show cached data warnings
   - Should not get stuck on "Loading events..."

3. **Offline Test:**
   - Disable network in DevTools
   - Navigate to Race Management page
   - Should show yellow "Working Offline" banner
   - Should display cached data
   - Re-enable network
   - Should show green "Connection Restored" banner for 3 seconds

4. **Connection Drop Test:**
   - Load page normally
   - Disable network briefly (1-2 seconds)
   - Re-enable network
   - Should recover gracefully without errors
   - Should not require page refresh

## Technical Details

### Timeout Hierarchy:
1. Individual query timeout: 15 seconds
2. Query retry with exponential backoff: up to 60 seconds (15s × 3 retries × backoff)
3. Main page data fetch: 30 seconds
4. Enrichment operations: 10 seconds each (non-blocking)

### Error Recovery Strategy:
1. First attempt with timeout protection
2. Retry with exponential backoff if connection error
3. Fall back to cached data ONLY if truly offline
4. Display error message if online but query fails

### Network Status Detection:
- Uses browser `navigator.onLine` API
- Monitors `online` and `offline` events
- Distinguishes between network disconnection and query timeout
- Prevents false positive offline indicators
