# Connection Timeout & Unresponsiveness Fix

## Problem
The application becomes unresponsive after periods of inactivity (e.g., leaving the app idle for a few minutes). Supabase queries timeout, and while cached data is used as a fallback, the UI doesn't properly update or show the data. A page refresh fixes the issue, indicating a stale connection problem.

## Root Causes Identified

1. **Stale Database Connections**: After inactivity, Supabase connections become stale and timeout
2. **Long Timeout Values**: 45-60 second timeouts meant users waited too long before seeing any response
3. **No Proactive Recovery**: The app waited for errors before attempting recovery
4. **No Connection Health Monitoring**: No mechanism to detect connection degradation before it became critical

## Solutions Implemented

### 1. Aggressive Timeout Reduction
**File: `src/utils/raceStorage.ts`**
- Reduced initial timeout from 45s → 8s
- Reduced retry timeout from 60s → 10s
- This makes failures fail fast, triggering recovery mechanisms sooner

### 2. Connection Health Monitoring
**File: `src/utils/supabase.ts`**
- Implemented active health checks every 15 seconds (previously 30s)
- Each health check performs an actual lightweight database query to test connectivity
- Tracks consecutive failures and time since last successful query
- Automatically attempts recovery after 2 consecutive failures or 30+ seconds of downtime

### 3. Proactive Connection Recovery
**File: `src/utils/supabase.ts`**

Added `forceConnectionRecovery()` function that:
- Refreshes the Supabase session
- Tests connectivity with a lightweight query
- Resets health check counters on success
- Can be called manually by components detecting issues

### 4. Smart Session Refresh on User Return
**File: `src/utils/supabase.ts`**
- Detects when user returns after 30+ seconds of inactivity
- Proactively refreshes session before any queries are attempted
- Resets connection health state on successful return
- Clears reload attempt flags

### 5. Retry with Recovery
**File: `src/utils/raceStorage.ts`**
- Before each retry, attempts full connection recovery
- Uses the new `forceConnectionRecovery()` function
- Provides better logging of recovery attempts

### 6. Keep-Alive Headers
**File: `src/utils/supabase.ts`**
- Added `Connection: keep-alive` header to all Supabase requests
- Helps maintain persistent connections

### 7. Auto-Reload on Critical Failure
**File: `src/utils/supabase.ts`**
- If connection cannot be recovered after 60+ seconds
- Automatically reloads the page once (tracked via sessionStorage)
- Only redirects to login if reload also fails (prevents login loops)

## How It Works

### Normal Operation
```
User loads page → Connection established → Health check every 15s → All queries succeed
```

### After Inactivity
```
User returns after 5 minutes
  ↓
Visibility change detected
  ↓
Proactive session refresh (prevents timeout)
  ↓
Connection restored before any queries
  ↓
Queries succeed immediately
```

### On Connection Failure
```
Query timeout (8 seconds)
  ↓
Attempt 1 fails → Force connection recovery → Retry (2s delay)
  ↓
Attempt 2 with 10s timeout
  ↓
If still fails → Fall back to cached data
```

### Health Check Recovery
```
Health check fails (5s timeout)
  ↓
Consecutive failure count increases
  ↓
After 2 failures or 30s of downtime:
  - Refresh session
  - Test connection
  - Reset counters
  ↓
If still failing after 60s → Page reload
```

## Benefits

1. **Faster Response**: 8-second timeout vs 45-second means users see results (cached or live) much faster
2. **Proactive Recovery**: Connection is refreshed before problems occur when user returns
3. **Self-Healing**: Automatic detection and recovery of connection issues
4. **Better UX**: No more "stuck" loading states - either data loads or cached data appears quickly
5. **Reduced Refreshes**: Fewer manual page refreshes needed
6. **Intelligent Fallback**: Cached data is used while connection recovery happens in background

## Testing Recommendations

1. **Idle Test**: Leave app open for 5+ minutes, then interact - should work without refresh
2. **Tab Switch Test**: Switch tabs for 2+ minutes, return - should work immediately
3. **Network Hiccup Test**: Briefly disconnect network - should recover automatically
4. **Load Test**: Navigate between pages rapidly - should not timeout

## Monitoring

Look for these console logs:
- `✓ Connection health check passed` - Regular health checks working
- `🔄 Attempting connection recovery...` - Recovery initiated
- `✓ Connection recovered successfully` - Recovery succeeded
- `⚠️ Connection health check failed (X consecutive failures)` - Issues detected
- `User returned after Xs, checking session...` - Proactive refresh on return

## Additional Notes

- All changes are backward compatible
- Cached data is still used as fallback if recovery fails
- No changes to database schema or queries
- Works across all components (Race Management, Calendar, Dashboard, etc.)
