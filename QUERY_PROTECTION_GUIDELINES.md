# Query Protection Guidelines

## Critical Rules for Database Queries

**IMPORTANT:** All Supabase queries MUST use the protection wrappers from `src/utils/queryHelpers.ts`

## Why This Matters

Without timeout protection and retry logic, queries can:
- Hang indefinitely, freezing the UI
- Fail silently on network issues
- Cause session timeout errors
- Create poor user experience

## The Solution

Use the centralized query helpers that provide:
- ✅ Automatic timeout protection
- ✅ Retry logic with exponential backoff
- ✅ Session validation and refresh
- ✅ Offline detection
- ✅ Consistent error handling
- ✅ Optional caching

---

## Quick Reference

### Standard Query
```typescript
import { protectedQuery, QUERY_TIMEOUTS } from '../utils/queryHelpers';

const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*').eq('club_id', clubId),
  {
    queryName: 'fetch members',
    timeout: QUERY_TIMEOUTS.NORMAL
  }
);
```

### Count Query
```typescript
import { protectedCount } from '../utils/queryHelpers';

const count = await protectedCount(
  () => supabase.from('members').select('*', { count: 'exact', head: true }),
  'count members'
);
```

### Single Row Query
```typescript
import { protectedSingleQuery } from '../utils/queryHelpers';

const member = await protectedSingleQuery(
  () => supabase.from('members').select('*').eq('id', id).maybeSingle(),
  'fetch member'
);
```

### Parallel Queries
```typescript
import { protectedParallelQueries, QUERY_TIMEOUTS } from '../utils/queryHelpers';

const [membersResult, tasksResult] = await protectedParallelQueries([
  {
    queryFn: () => supabase.from('members').select('*'),
    queryName: 'fetch members',
    timeout: QUERY_TIMEOUTS.NORMAL
  },
  {
    queryFn: () => supabase.from('tasks').select('*'),
    queryName: 'fetch tasks',
    timeout: QUERY_TIMEOUTS.FAST
  }
]);
```

### With Club Guard
```typescript
import { withClubGuard, protectedQuery } from '../utils/queryHelpers';

const members = await withClubGuard(
  clubId,
  () => protectedQuery(
    () => supabase.from('members').select('*').eq('club_id', clubId),
    { queryName: 'fetch members' }
  )
);
```

### External API Call
```typescript
import { protectedExternalAPI, QUERY_TIMEOUTS } from '../utils/queryHelpers';

const response = await protectedExternalAPI(
  () => fetch('https://api.example.com/data'),
  QUERY_TIMEOUTS.WEATHER,
  'fetch external data'
);
```

### Cached Query
```typescript
import { cachedQuery, protectedQuery } from '../utils/queryHelpers';

const members = await cachedQuery(
  `members_${clubId}`,
  () => protectedQuery(
    () => supabase.from('members').select('*').eq('club_id', clubId),
    { queryName: 'fetch members' }
  ),
  3600000 // 1 hour cache
);
```

---

## Timeout Guidelines

Use these predefined timeouts from `QUERY_TIMEOUTS`:

| Timeout | Duration | Use Case |
|---------|----------|----------|
| `FAST` | 3 seconds | Count queries, simple selects |
| `NORMAL` | 5 seconds | Standard queries (default) |
| `MODERATE` | 8 seconds | Queries with joins |
| `SLOW` | 10 seconds | Complex queries, aggregations |
| `LAYOUT` | 8 seconds | Layout/template loading |
| `WEATHER` | 5 seconds | External API calls |

---

## Migration Checklist

When adding a new query:

- [ ] Import query helpers from `src/utils/queryHelpers.ts`
- [ ] Wrap query with `protectedQuery()` or appropriate helper
- [ ] Provide a descriptive `queryName` for debugging
- [ ] Choose appropriate timeout from `QUERY_TIMEOUTS`
- [ ] Add offline check if needed (`skipOfflineCheck: false` is default)
- [ ] Add club guard if query requires club context
- [ ] Handle error case (helpers return `{ data: null, error }` on failure)
- [ ] Test query timeout behavior

---

## Common Patterns

### React Component Data Fetching

```typescript
const fetchData = async () => {
  if (!currentClub?.clubId || !navigator.onLine) return;

  try {
    const { data, error } = await protectedQuery(
      () => supabase
        .from('members')
        .select('*')
        .eq('club_id', currentClub.clubId),
      {
        queryName: 'fetch members',
        timeout: QUERY_TIMEOUTS.NORMAL
      }
    );

    if (error) {
      console.error('Failed to fetch members:', error);
      return;
    }

    setMembers(data || []);
  } catch (err) {
    console.error('Unexpected error:', err);
  }
};
```

### Multiple Related Queries

```typescript
const fetchDashboardData = async () => {
  const results = await protectedParallelQueries([
    {
      queryFn: () => supabase.from('members').select('*'),
      queryName: 'fetch members',
      timeout: QUERY_TIMEOUTS.NORMAL
    },
    {
      queryFn: () => supabase.from('tasks').select('*'),
      queryName: 'fetch tasks',
      timeout: QUERY_TIMEOUTS.FAST
    },
    {
      queryFn: () => supabase.from('events').select('*'),
      queryName: 'fetch events',
      timeout: QUERY_TIMEOUTS.NORMAL
    }
  ]);

  const [membersResult, tasksResult, eventsResult] = results;

  setMembers(membersResult.data || []);
  setTasks(tasksResult.data || []);
  setEvents(eventsResult.data || []);
};
```

---

## Code Review Checklist

When reviewing PRs, verify:

- [ ] No direct `await supabase.from()...` calls without protection
- [ ] All queries use helpers from `queryHelpers.ts`
- [ ] Appropriate timeout is specified
- [ ] Query names are descriptive
- [ ] Offline checks are in place where needed
- [ ] Error handling is implemented
- [ ] Parallel queries use `protectedParallelQueries()`
- [ ] External APIs use `protectedExternalAPI()`

---

## Anti-Patterns to Avoid

### ❌ BAD: Direct Supabase call
```typescript
const { data, error } = await supabase
  .from('members')
  .select('*');
```

### ✅ GOOD: Protected query
```typescript
const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*'),
  { queryName: 'fetch members' }
);
```

---

### ❌ BAD: Multiple queries without timeout
```typescript
const [result1, result2] = await Promise.all([
  supabase.from('members').select('*'),
  supabase.from('tasks').select('*')
]);
```

### ✅ GOOD: Protected parallel queries
```typescript
const [result1, result2] = await protectedParallelQueries([
  { queryFn: () => supabase.from('members').select('*'), queryName: 'fetch members' },
  { queryFn: () => supabase.from('tasks').select('*'), queryName: 'fetch tasks' }
]);
```

---

### ❌ BAD: No offline check
```typescript
const { data } = await supabase.from('members').select('*');
```

### ✅ GOOD: Automatic offline detection
```typescript
const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*'),
  { queryName: 'fetch members' }
  // skipOfflineCheck: false is the default
);
```

---

### ❌ BAD: External API without timeout
```typescript
const response = await fetch('https://api.weather.com/...');
```

### ✅ GOOD: Protected external API
```typescript
const response = await protectedExternalAPI(
  () => fetch('https://api.weather.com/...'),
  QUERY_TIMEOUTS.WEATHER,
  'fetch weather'
);
```

---

## Testing Query Protection

### Test Timeout Behavior

```typescript
// Simulate slow query
const { data, error } = await protectedQuery(
  async () => {
    await new Promise(resolve => setTimeout(resolve, 6000)); // 6 seconds
    return await supabase.from('members').select('*');
  },
  {
    queryName: 'slow query test',
    timeout: QUERY_TIMEOUTS.FAST // 3 seconds - should timeout
  }
);

console.log('Should have error:', error); // Timeout error
```

### Test Offline Behavior

```typescript
// Temporarily disable network
Object.defineProperty(navigator, 'onLine', { value: false });

const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*'),
  { queryName: 'offline test' }
);

console.log('Should return offline error:', error);
```

---

## Performance Monitoring

All protected queries log timing information:

```typescript
// Logs appear in console:
// ✓ Query "fetch members" completed in 234ms
// ⚠️ Query "fetch tasks" timed out after 5000ms
// ❌ Query "fetch events" failed: Network error
```

Use browser DevTools to monitor:
1. Network tab - Check actual request timing
2. Console - Check for timeout warnings
3. Performance tab - Profile component render timing

---

## Future Improvements

Consider adding:
- [ ] Query performance metrics collection
- [ ] Automatic query plan optimization suggestions
- [ ] Query result size monitoring
- [ ] Custom timeout adjustments based on historical data
- [ ] Query queue management for offline mode

---

## Support

If you encounter issues with query protection:

1. Check console for timeout warnings
2. Verify timeout is appropriate for query complexity
3. Check network conditions (DevTools Network tab)
4. Verify session is valid (check AuthContext)
5. Test with offline mode to verify graceful degradation

For questions, contact the development team or refer to:
- `src/utils/queryHelpers.ts` - Implementation
- `src/utils/supabase.ts` - Base retry logic
- This document - Usage guidelines
