# Database Stability Improvements

## Overview
This document outlines the stability improvements made to ensure reliable database connectivity and prevent application unresponsiveness.

## Key Improvements

### 1. Enhanced Connection Configuration
**File:** `src/utils/supabase.ts`

- **Keep-alive connections**: Added `keepalive: true` to all fetch requests
- **Request timeout handling**: 30-second timeout with proper cleanup
- **Realtime configuration**:
  - Timeout: 20 seconds
  - Heartbeat interval: 15 seconds
  - Events per second limit: 10

### 2. Channel Management System
Prevents duplicate subscriptions and memory leaks:

```typescript
// Use managed channels instead of creating new ones
const channel = getOrCreateChannel('channel-name', (ch) =>
  ch.on('postgres_changes', { ... }).subscribe()
);

// Cleanup
removeChannelByName('channel-name');
```

**Benefits:**
- Reuses existing channels when possible
- Prevents duplicate subscriptions
- Automatic cleanup on component unmount
- Tracks channel state (joined/joining)

### 3. Query Caching
Reduces redundant database calls:

```typescript
// Cache queries for 5 seconds by default
const result = await cachedQuery(
  'members-club-123',
  () => supabase.from('members').select('*'),
  5000 // TTL in milliseconds
);

// Invalidate cache when data changes
invalidateCache('members'); // Clears all keys containing 'members'
```

**Benefits:**
- Reduces database load
- Faster response times
- Configurable TTL per query
- Pattern-based cache invalidation

### 4. Retry Logic with Exponential Backoff
**File:** `src/utils/supabase.ts`

The `retryQuery()` function automatically retries failed queries:
- Max retries: 3
- Exponential backoff: 1s, 2s, 4s
- Retries on: network errors, timeouts, JWT expiration, connection failures
- Automatic session refresh before retry

### 5. Health Check System
**Frequency:** Every 60 seconds

- Validates session integrity
- Refreshes token if expiring within 5 minutes
- Non-blocking (doesn't stop app functionality)
- Automatic recovery on visibility changes (after 5+ minutes away)

### 6. Session Management
- **Auto-refresh**: Enabled
- **Persist session**: Uses localStorage
- **PKCE flow**: Enhanced security
- **Validation**: Checks token expiry before queries

## Best Practices for Developers

### Using Realtime Subscriptions

**DO:**
```typescript
useEffect(() => {
  if (!clubId) return;

  const channel = getOrCreateChannel(`members-${clubId}`, (ch) =>
    ch.on('postgres_changes', { ... }).subscribe()
  );

  return () => removeChannelByName(`members-${clubId}`);
}, [clubId]);
```

**DON'T:**
```typescript
// This creates duplicate subscriptions!
useEffect(() => {
  const channel = supabase.channel('members')
    .on('postgres_changes', { ... })
    .subscribe();
  // No cleanup!
}, [clubId]);
```

### Using Cached Queries

**For frequently accessed data:**
```typescript
const { data } = await cachedQuery(
  `club-${clubId}`,
  () => supabase.from('clubs').select('*').eq('id', clubId).single(),
  30000 // Cache for 30 seconds
);
```

**Invalidate after mutations:**
```typescript
// After updating a member
await supabase.from('members').update({ ... });
invalidateCache(`members-${clubId}`);
```

### Error Handling

Always use the retry wrapper for critical queries:
```typescript
const result = await retryQuery(
  () => supabase.from('clubs').select('*'),
  3, // maxRetries
  1000 // initial delay
);

if (result.error) {
  // Handle error after all retries failed
}
```

## Monitoring

### Console Logs
The system logs important events:
- ✓ Connection test passed
- 🔄 Reusing existing channel
- ⚠️ Request timeout
- ❌ Connection recovery failed

### Performance Metrics
Monitor these in browser console:
- `fromCache: true` - Query served from cache
- Channel reuse messages
- Retry attempts

## Troubleshooting

### App becomes unresponsive
1. Check browser console for timeout errors
2. Verify internet connection
3. Check if multiple tabs are open (shares connection pool)
4. Try manual refresh: Connection will auto-recover

### Data not updating
1. Check if realtime subscription is active
2. Verify RLS policies allow the operation
3. Check cache invalidation after mutations

### Memory leaks
- Ensure all subscriptions have cleanup in `useEffect` return
- Use channel manager (`getOrCreateChannel`) instead of direct `supabase.channel()`
- Check that components properly unmount

## Technical Details

### Connection Pool
- Supabase JS client maintains a connection pool
- Keep-alive prevents connection drops
- Automatic reconnection on network changes

### Realtime WebSocket
- Heartbeat every 15 seconds
- 20-second timeout for responses
- Automatic reconnection on disconnect

### Cache Storage
- In-memory Map
- Per-query TTL
- Pattern-based invalidation
- Automatic expiry

## Future Improvements
- [ ] Add connection quality indicator in UI
- [ ] Implement request queuing during offline mode
- [ ] Add metrics dashboard for query performance
- [ ] Implement smart cache warming on app load
