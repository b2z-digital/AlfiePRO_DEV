# Preventing Future Timeout Issues

## Overview

This document explains the protection system that prevents connection timeout and dropout issues from occurring in future development.

## The Problem (Before)

When developers added new Supabase queries without proper timeout protection:

```typescript
// ❌ UNSAFE - Can hang indefinitely
const { data, error } = await supabase
  .from('members')
  .select('*');
```

This caused:
- App freezing and becoming unresponsive
- Session timeouts going undetected
- Poor user experience with infinite loading states
- Network issues causing silent failures

## The Solution (Now)

All queries MUST use the centralized protection wrappers:

```typescript
// ✅ SAFE - Automatic timeout + retry + session refresh
import { protectedQuery, QUERY_TIMEOUTS } from '../utils/queryHelpers';

const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*'),
  {
    queryName: 'fetch members',
    timeout: QUERY_TIMEOUTS.NORMAL
  }
);
```

---

## Protection Layers

### 1. Centralized Query Helpers (`src/utils/queryHelpers.ts`)

**Purpose:** Provides reusable wrappers that automatically add protection to all queries.

**Features:**
- Automatic timeout protection
- Retry logic with exponential backoff
- Session validation and refresh
- Offline detection
- Consistent error handling
- Optional caching

**Key Functions:**
- `protectedQuery()` - Standard query wrapper
- `protectedCount()` - Optimized for count queries
- `protectedSingleQuery()` - For single row queries
- `protectedParallelQueries()` - For parallel execution
- `protectedExternalAPI()` - For external APIs
- `withClubGuard()` - Ensures club context exists
- `cachedQuery()` - Adds caching layer

### 2. Usage Guidelines (`QUERY_PROTECTION_GUIDELINES.md`)

**Purpose:** Complete documentation with examples and patterns.

**Contents:**
- Quick reference for common patterns
- Timeout guidelines
- Migration checklist
- Code review checklist
- Anti-patterns to avoid
- Testing strategies

### 3. ESLint Rule (`.eslintrc-query-protection.json`)

**Purpose:** Catches unprotected queries during development.

**How it works:**
- Detects direct `supabase.from()` calls
- Shows helpful error messages
- Guides developers to use query helpers

**To enable (optional):**
```json
// Add to your main eslint config
{
  "extends": ["./.eslintrc-query-protection.json"]
}
```

---

## For Developers: Quick Start

### Step 1: Import the helpers

```typescript
import {
  protectedQuery,
  protectedCount,
  QUERY_TIMEOUTS
} from '../utils/queryHelpers';
```

### Step 2: Wrap your query

**Before:**
```typescript
const { data, error } = await supabase
  .from('members')
  .select('*')
  .eq('club_id', clubId);
```

**After:**
```typescript
const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*').eq('club_id', clubId),
  {
    queryName: 'fetch members',
    timeout: QUERY_TIMEOUTS.NORMAL
  }
);
```

### Step 3: Choose the right timeout

```typescript
QUERY_TIMEOUTS.FAST      // 3s - Count queries, simple selects
QUERY_TIMEOUTS.NORMAL    // 5s - Standard queries (DEFAULT)
QUERY_TIMEOUTS.MODERATE  // 8s - Queries with joins
QUERY_TIMEOUTS.SLOW      // 10s - Complex queries, aggregations
```

---

## Common Use Cases

### Fetching Data in a Component

```typescript
const fetchMembers = async () => {
  if (!currentClub?.clubId || !navigator.onLine) return;

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
    console.error('Failed to fetch:', error);
    return;
  }

  setMembers(data || []);
};
```

### Count Queries

```typescript
const count = await protectedCount(
  () => supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId),
  'count members'
);

setMemberCount(count);
```

### Parallel Queries

```typescript
import { protectedParallelQueries } from '../utils/queryHelpers';

const [membersResult, tasksResult, eventsResult] = await protectedParallelQueries([
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

setMembers(membersResult.data || []);
setTasks(tasksResult.data || []);
setEvents(eventsResult.data || []);
```

---

## Code Review Checklist

When reviewing pull requests, check:

- [ ] All Supabase queries use `protectedQuery()` or similar helpers
- [ ] No direct `await supabase.from()...` calls
- [ ] Appropriate timeout is specified
- [ ] Query names are descriptive for debugging
- [ ] Offline checks are in place where needed
- [ ] Error handling is properly implemented
- [ ] External API calls use `protectedExternalAPI()`

---

## Benefits

### For Users
- ✅ App never freezes or hangs
- ✅ Fast, responsive experience
- ✅ Graceful offline behavior
- ✅ Automatic recovery from network issues

### For Developers
- ✅ Consistent error handling
- ✅ Easy to debug with query names
- ✅ No need to remember timeout logic
- ✅ Automatic retry on failures
- ✅ Built-in offline detection

### For the Project
- ✅ Prevents regression of timeout issues
- ✅ Enforces best practices automatically
- ✅ Reduces technical debt
- ✅ Improves code maintainability

---

## Testing

### Test Timeout Behavior

```typescript
// Simulate a slow query (should timeout)
const { data, error } = await protectedQuery(
  async () => {
    await new Promise(resolve => setTimeout(resolve, 6000));
    return await supabase.from('members').select('*');
  },
  {
    queryName: 'slow query test',
    timeout: QUERY_TIMEOUTS.FAST // 3s - will timeout
  }
);

expect(error).toBeDefined();
expect(error.message).toContain('timeout');
```

### Test Offline Behavior

```typescript
// Mock offline state
Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

const { data, error } = await protectedQuery(
  () => supabase.from('members').select('*'),
  { queryName: 'offline test' }
);

expect(error).toBeDefined();
expect(error.message).toContain('offline');
```

---

## Monitoring

All protected queries log their status:

```
Console output:
✓ Query "fetch members" completed in 234ms
⚠️ Query "fetch tasks" timed out after 5000ms
🔄 Query "fetch events" retrying (attempt 2/3)
✓ Query "fetch events" completed after retry in 1.2s
```

Use browser DevTools to monitor:
1. **Network Tab** - Actual request timing
2. **Console** - Query status and timing
3. **Performance Tab** - Component render impact

---

## Migration Guide

If you have existing code with direct Supabase queries:

### Step 1: Find all unprotected queries
```bash
# Search for direct supabase.from calls
grep -r "await supabase.from" src/
```

### Step 2: Import the helpers
```typescript
import { protectedQuery, QUERY_TIMEOUTS } from '../utils/queryHelpers';
```

### Step 3: Wrap each query
```typescript
// Before
const { data, error } = await supabase.from('table').select('*');

// After
const { data, error } = await protectedQuery(
  () => supabase.from('table').select('*'),
  { queryName: 'describe what this fetches', timeout: QUERY_TIMEOUTS.NORMAL }
);
```

### Step 4: Test thoroughly
- Verify query still works
- Test timeout behavior
- Check error handling
- Verify offline mode

---

## Examples in Codebase

See these files for real-world examples:

- `src/components/DashboardHome.tsx` - All fetch functions now use protected queries
- `src/utils/queryHelpers.ts` - Complete implementation
- `QUERY_PROTECTION_GUIDELINES.md` - Full documentation

---

## FAQ

### Q: Do I need to use this for ALL queries?
**A:** Yes! Every Supabase query should be protected. No exceptions.

### Q: What if my query is really simple?
**A:** Even simple queries can hang on poor connections. Always use protection.

### Q: Can I adjust the timeout?
**A:** Yes! Choose from `QUERY_TIMEOUTS` or specify a custom value. But use standard timeouts when possible for consistency.

### Q: What about mutations (insert/update/delete)?
**A:** Yes, protect those too! They can also hang or fail.

```typescript
const { error } = await protectedQuery(
  () => supabase.from('members').insert(newMember),
  { queryName: 'insert member', timeout: QUERY_TIMEOUTS.NORMAL }
);
```

### Q: Does this work with realtime subscriptions?
**A:** Subscriptions are handled separately by Supabase. Focus on protecting query operations.

### Q: What if I need a longer timeout?
**A:** Use `QUERY_TIMEOUTS.SLOW (10s)` or specify a custom value. But review if the query can be optimized first.

---

## Getting Help

- Read `QUERY_PROTECTION_GUIDELINES.md` for detailed examples
- Check `src/utils/queryHelpers.ts` for implementation
- Review existing protected queries in `DashboardHome.tsx`
- Ask the team if unsure about a specific case

---

## Summary

**The Golden Rule:**
> Never write `await supabase.from()` directly. Always wrap it with `protectedQuery()` or similar helpers.

This simple rule prevents timeout issues, improves UX, and makes the codebase more maintainable.

**Remember:**
- Import from `src/utils/queryHelpers.ts`
- Choose appropriate timeout
- Provide descriptive query name
- Handle errors properly
- Test your changes

Following these guidelines ensures the app remains fast, responsive, and reliable for all users.
