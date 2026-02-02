/**
 * Query Helpers - Centralized query protection utilities
 *
 * This file provides standardized wrappers for all database queries to ensure:
 * - Automatic timeout protection
 * - Retry logic with exponential backoff
 * - Session validation and refresh
 * - Offline detection
 * - Consistent error handling
 *
 * CRITICAL: Always use these helpers for ANY new Supabase queries!
 */

import { supabase, retryQuery } from './supabase';

/**
 * Default timeout configurations for different query types
 */
export const QUERY_TIMEOUTS = {
  FAST: 3000,      // 3 seconds - for count queries, simple selects
  NORMAL: 8000,    // 8 seconds - for standard queries (increased from 5)
  MODERATE: 10000, // 10 seconds - for queries with joins (increased from 8)
  SLOW: 15000,     // 15 seconds - for complex queries, aggregations (increased from 10)
  LAYOUT: 10000,   // 10 seconds - for layout/template loading (increased from 8)
  WEATHER: 5000,   // 5 seconds - for external API calls
} as const;

/**
 * Standard error messages
 */
const ERROR_MESSAGES = {
  TIMEOUT: (queryName: string, timeout: number) =>
    `${queryName} timed out after ${timeout}ms`,
  OFFLINE: 'Query skipped - device is offline',
  NO_CLUB: 'Query skipped - no club selected',
  SESSION_INVALID: 'Session invalid - query may fail',
} as const;

/**
 * Wraps a query function with timeout protection
 *
 * @param queryFn - Function that returns a promise with {data, error}
 * @param timeoutMs - Timeout in milliseconds
 * @param queryName - Name for logging/debugging
 * @returns Promise that resolves with {data, error} or rejects on timeout
 *
 * @example
 * const result = await withTimeout(
 *   async () => supabase.from('members').select('*'),
 *   QUERY_TIMEOUTS.NORMAL,
 *   'fetch members'
 * );
 */
export async function withTimeout<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  timeoutMs: number,
  queryName: string
): Promise<{ data: T | null; error: any }> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(ERROR_MESSAGES.TIMEOUT(queryName, timeoutMs))), timeoutMs)
  );

  try {
    const result = await Promise.race([queryFn(), timeoutPromise]);
    return result;
  } catch (error: any) {
    console.error(`Query "${queryName}" failed:`, error);
    return { data: null, error };
  }
}

/**
 * Wraps a query with timeout AND retry logic
 *
 * This is the RECOMMENDED wrapper for all Supabase queries
 *
 * @param queryFn - Function that returns a Supabase query
 * @param options - Configuration options
 * @returns Promise that resolves with {data, error}
 *
 * @example
 * const { data, error } = await protectedQuery(
 *   () => supabase.from('members').select('*').eq('club_id', clubId),
 *   { timeout: QUERY_TIMEOUTS.NORMAL, queryName: 'fetch members' }
 * );
 */
export async function protectedQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  options: {
    timeout?: number;
    queryName?: string;
    skipOfflineCheck?: boolean;
    maxRetries?: number;
  } = {}
): Promise<{ data: T | null; error: any }> {
  const {
    timeout = QUERY_TIMEOUTS.NORMAL,
    queryName = 'unnamed query',
    skipOfflineCheck = false,
    maxRetries = 3,
  } = options;

  // Check if offline (unless explicitly skipped)
  if (!skipOfflineCheck && !navigator.onLine) {
    console.log(`${ERROR_MESSAGES.OFFLINE}: ${queryName}`);
    return { data: null, error: new Error(ERROR_MESSAGES.OFFLINE) };
  }

  // Wrap with timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(ERROR_MESSAGES.TIMEOUT(queryName, timeout))), timeout)
  );

  // Wrap with retry logic
  const retryPromise = retryQuery(queryFn, maxRetries);

  try {
    const result = await Promise.race([retryPromise, timeoutPromise]);
    return result;
  } catch (error: any) {
    console.error(`Protected query "${queryName}" failed:`, error);
    return { data: null, error };
  }
}

/**
 * Wraps a count query (optimized for fast execution)
 *
 * @example
 * const count = await protectedCount(
 *   () => supabase.from('members').select('*', { count: 'exact', head: true }),
 *   'count members'
 * );
 */
export async function protectedCount(
  queryFn: () => Promise<{ count: number | null; error: any }>,
  queryName: string = 'count query'
): Promise<number> {
  const { data: count, error } = await protectedQuery(
    async () => {
      const result = await queryFn();
      return { data: result.count, error: result.error };
    },
    { timeout: QUERY_TIMEOUTS.FAST, queryName }
  );

  if (error) {
    console.error(`Count query "${queryName}" failed:`, error);
    return 0;
  }

  return count || 0;
}

/**
 * Wraps multiple queries with timeout protection for parallel execution
 *
 * @param queries - Array of query configurations
 * @returns Promise.allSettled results
 *
 * @example
 * const results = await protectedParallelQueries([
 *   {
 *     queryFn: () => supabase.from('members').select('*'),
 *     queryName: 'fetch members',
 *     timeout: QUERY_TIMEOUTS.NORMAL
 *   },
 *   {
 *     queryFn: () => supabase.from('tasks').select('*'),
 *     queryName: 'fetch tasks',
 *     timeout: QUERY_TIMEOUTS.FAST
 *   }
 * ]);
 */
export async function protectedParallelQueries<T = any>(
  queries: Array<{
    queryFn: () => Promise<{ data: T | null; error: any }>;
    queryName: string;
    timeout?: number;
  }>
): Promise<Array<{ data: T | null; error: any }>> {
  const promises = queries.map(({ queryFn, queryName, timeout }) =>
    protectedQuery(queryFn, { timeout, queryName })
  );

  const results = await Promise.allSettled(promises);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`Parallel query "${queries[index].queryName}" failed:`, result.reason);
      return { data: null, error: result.reason };
    }
  });
}

/**
 * Wraps an external API call (non-Supabase) with timeout protection
 *
 * @example
 * const weatherData = await protectedExternalAPI(
 *   () => fetch('https://api.weather.com/...'),
 *   QUERY_TIMEOUTS.WEATHER,
 *   'fetch weather'
 * );
 */
export async function protectedExternalAPI<T = Response>(
  apiFn: () => Promise<T>,
  timeout: number = QUERY_TIMEOUTS.NORMAL,
  apiName: string = 'external API'
): Promise<T | null> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(ERROR_MESSAGES.TIMEOUT(apiName, timeout))), timeout)
  );

  try {
    const result = await Promise.race([apiFn(), timeoutPromise]);
    return result;
  } catch (error: any) {
    console.error(`External API "${apiName}" failed:`, error);
    return null;
  }
}

/**
 * Type-safe wrapper for single row queries (using maybeSingle)
 *
 * @example
 * const member = await protectedSingleQuery(
 *   () => supabase.from('members').select('*').eq('id', memberId).maybeSingle(),
 *   'fetch member'
 * );
 */
export async function protectedSingleQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  queryName: string = 'single query',
  timeout: number = QUERY_TIMEOUTS.NORMAL
): Promise<T | null> {
  const { data, error } = await protectedQuery(queryFn, { timeout, queryName });

  if (error) {
    console.error(`Single query "${queryName}" failed:`, error);
    return null;
  }

  return data;
}

/**
 * Guards a query to only run if a club is selected
 *
 * @example
 * const members = await withClubGuard(
 *   clubId,
 *   () => protectedQuery(
 *     () => supabase.from('members').select('*').eq('club_id', clubId),
 *     { queryName: 'fetch members' }
 *   )
 * );
 */
export async function withClubGuard<T>(
  clubId: string | null | undefined,
  queryFn: () => Promise<T>
): Promise<T | null> {
  if (!clubId) {
    console.log(ERROR_MESSAGES.NO_CLUB);
    return null;
  }
  return await queryFn();
}

/**
 * Cache wrapper for queries that can be cached
 *
 * @example
 * const members = await cachedQuery(
 *   'members_list',
 *   () => protectedQuery(
 *     () => supabase.from('members').select('*'),
 *     { queryName: 'fetch members' }
 *   ),
 *   3600000 // 1 hour cache
 * );
 */
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<{ data: T | null; error: any }>,
  cacheDurationMs: number = 300000 // 5 minutes default
): Promise<T | null> {
  // Try to get from cache first
  const cached = localStorage.getItem(`query_cache_${cacheKey}`);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheDurationMs) {
        console.log(`Using cached data for: ${cacheKey}`);
        return data;
      }
    } catch (e) {
      console.warn('Failed to parse cache:', e);
    }
  }

  // Fetch fresh data
  const { data, error } = await queryFn();

  if (error) {
    console.error(`Cached query "${cacheKey}" failed:`, error);
    return null;
  }

  // Store in cache
  if (data) {
    try {
      localStorage.setItem(
        `query_cache_${cacheKey}`,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (e) {
      console.warn('Failed to cache data:', e);
    }
  }

  return data;
}

/**
 * Clears cached query data
 */
export function clearQueryCache(cacheKey?: string) {
  if (cacheKey) {
    localStorage.removeItem(`query_cache_${cacheKey}`);
  } else {
    // Clear all query caches
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('query_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * IMPORTANT USAGE GUIDELINES:
 *
 * 1. ALWAYS use protectedQuery() for new Supabase queries
 * 2. Use protectedCount() for count-only queries
 * 3. Use protectedParallelQueries() when fetching multiple datasets
 * 4. Use protectedExternalAPI() for external API calls (weather, etc.)
 * 5. Use withClubGuard() when query requires a club context
 * 6. Use cachedQuery() for data that doesn't change frequently
 *
 * Example migration from old code:
 *
 * OLD (UNSAFE):
 * const { data, error } = await supabase
 *   .from('members')
 *   .select('*')
 *   .eq('club_id', clubId);
 *
 * NEW (SAFE):
 * const { data, error } = await protectedQuery(
 *   () => supabase.from('members').select('*').eq('club_id', clubId),
 *   { queryName: 'fetch members', timeout: QUERY_TIMEOUTS.NORMAL }
 * );
 *
 * Or even better with club guard:
 * const { data, error } = await withClubGuard(
 *   clubId,
 *   () => protectedQuery(
 *     () => supabase.from('members').select('*').eq('club_id', clubId),
 *     { queryName: 'fetch members' }
 *   )
 * ) || { data: null, error: null };
 */
