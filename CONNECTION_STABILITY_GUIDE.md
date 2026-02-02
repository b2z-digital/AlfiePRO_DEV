# Database Connection Stability Guide

## Problem

Users were experiencing database connection issues where:
- Data stops loading after the page sits idle for a while
- Dashboard cards show no data until page refresh
- Authentication tokens expire silently
- Network interruptions cause permanent failures

## Root Causes

1. **JWT Token Expiration**: Supabase JWT tokens expire after 1 hour by default
2. **Network Timeouts**: No retry logic for failed queries
3. **Silent Connection Drops**: No user feedback when connections fail
4. **No Session Refresh**: Tokens not proactively refreshed before expiry

## Solution Implemented

### 1. Enhanced Supabase Client Configuration (`src/utils/supabase.ts`)

```typescript
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,        // Automatically refresh tokens
    persistSession: true,           // Persist session across page reloads
    detectSessionInUrl: true,       // Handle OAuth callbacks
    storage: window.localStorage,   // Use localStorage for session
    storageKey: 'alfie-pro-auth',  // Custom storage key
    flowType: 'pkce'               // Use PKCE flow for security
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10          // Throttle realtime events
    }
  }
});
```

### 2. Automatic Query Retry (`src/utils/supabase.ts`)

The `retryQuery` function automatically retries failed queries:

```typescript
// Usage in components:
import { retryQuery } from '../utils/supabase';

const result = await retryQuery(async () => {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('id', id);
  return { data, error };
});

if (result.error) {
  // Handle error
}
// Use result.data
```

**Features:**
- Retries up to 3 times with exponential backoff
- Detects connection errors vs. other errors
- Only retries network/connection failures
- Attempts session refresh before retry

### 3. Connection Health Check (`src/utils/supabase.ts`)

Automatic background monitoring:

```typescript
// Runs every minute to:
// 1. Check if session exists
// 2. Refresh token if < 5 minutes until expiry
// 3. Prevent silent expiration

startConnectionHealthCheck(); // Called automatically
```

### 4. Visual Connection Monitor (`src/components/ConnectionMonitor.tsx`)

Shows user-friendly notifications:
- **Connection Lost**: Red notification when offline
- **Connection Restored**: Green notification when back online
- Automatically refreshes session on reconnection

### 5. Custom Hook for Safe Queries (`src/hooks/useSupabaseQuery.ts`)

React hook that handles loading, errors, and retries:

```typescript
const { data, loading, error, refetch } = useSupabaseQuery({
  queryFn: () => supabase.from('clubs').select('*'),
  dependencies: [clubId],
  retry: true,
  onError: (err) => console.error(err)
});
```

### 6. Enhanced Auth Context (`src/contexts/AuthContext.tsx`)

Improved authentication state management:
- Handles TOKEN_REFRESHED events
- Properly cleans up on SIGNED_OUT
- Better error handling for session operations

## How to Use

### For New Components

Use the custom hook:

```typescript
import { useSupabaseQuery } from '../hooks/useSupabaseQuery';

function MyComponent() {
  const { data, loading, error } = useSupabaseQuery({
    queryFn: () => supabase.from('my_table').select('*'),
    dependencies: [someId]
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{/* render data */}</div>;
}
```

### For Existing Components

Wrap existing queries with `retryQuery`:

```typescript
// Before:
const { data, error } = await supabase
  .from('clubs')
  .select('*');

// After:
const result = await retryQuery(async () => {
  const { data, error } = await supabase
    .from('clubs')
    .select('*');
  return { data, error };
});

if (result.error) {
  // Handle error
}
// Use result.data
```

## Benefits

1. **Automatic Recovery**: Network issues resolve without user intervention
2. **Proactive Token Refresh**: Prevents token expiration issues
3. **User Feedback**: Visual indicators for connection status
4. **Better UX**: Seamless experience even with poor connectivity
5. **Error Resilience**: Automatic retries for transient failures

## Testing

To test the improvements:

1. **Token Expiration**:
   - Open app and wait 60+ minutes
   - Data should continue loading without refresh

2. **Network Interruption**:
   - Open DevTools → Network tab
   - Set to "Offline"
   - Should see red "Connection Lost" notification
   - Set back to "Online"
   - Should see green "Connection Restored" notification
   - Data should reload automatically

3. **Idle Page**:
   - Open app and leave idle for 30+ minutes
   - Return and interact with dashboard
   - Data should load without manual refresh

## Migration Guide

To update existing data-fetching code:

1. Import retryQuery:
   ```typescript
   import { retryQuery } from '../utils/supabase';
   ```

2. Wrap existing queries:
   ```typescript
   const result = await retryQuery(async () => {
     const { data, error } = await yourExistingQuery;
     return { data, error };
   });
   ```

3. Update references from `data` to `result.data` and `error` to `result.error`

## Configuration

Adjust retry behavior in `src/utils/supabase.ts`:

```typescript
retryQuery(queryFn, maxRetries = 3, delay = 1000)
```

- `maxRetries`: Number of retry attempts (default: 3)
- `delay`: Base delay in ms (multiplied by attempt number)

Adjust health check interval:

```typescript
window.setInterval(async () => {
  // Health check code
}, 60000); // 60000 = 1 minute
```

## Troubleshooting

**Issue**: Still seeing connection errors
**Solution**: Check browser console for specific error messages

**Issue**: Token refresh failing
**Solution**: Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env

**Issue**: Notifications not showing
**Solution**: Ensure ConnectionMonitor is imported in App.tsx

**Issue**: Queries still failing after retry
**Solution**: Check if error is connection-related or data-related (retryQuery only retries connection errors)

## Performance Impact

- **Health Check**: Minimal, runs once per minute
- **Retry Logic**: Only activates on failures
- **Connection Monitor**: Lightweight React component
- **Overall**: Negligible impact on app performance

## Security

- Uses PKCE flow for enhanced security
- Tokens stored in localStorage with custom key
- Session refresh happens automatically
- No sensitive data logged

## Future Enhancements

Potential improvements:
1. Configurable retry strategies per query type
2. Offline data caching with service workers
3. Optimistic UI updates
4. Background sync for failed mutations
5. Connection quality indicators
