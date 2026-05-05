import { invalidateCache } from './supabase';
import { emitDataChange } from './dataEvents';

type MutationResult<T> = { data: T | null; error: any };

/**
 * Explicit mutation wrapper for cases where you want to manually signal
 * that a table changed (e.g., after RPC calls that the fetch interceptor
 * won't detect as table mutations).
 *
 * For standard .insert()/.update()/.delete() calls, the universal fetch
 * interceptor handles invalidation automatically. This wrapper is mainly
 * useful for RPC calls or batch operations.
 */
export async function mutate<T = any>(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  query: PromiseLike<MutationResult<T>>
): Promise<MutationResult<T>> {
  const result = await query;

  if (!result.error) {
    invalidateCache(table);
    emitDataChange(table, operation);
  }

  return result;
}

/**
 * Signal that a table was mutated (use after RPC calls or custom mutation logic).
 * Clears caches and notifies all subscribers.
 */
export function signalMutation(table: string, operation: 'insert' | 'update' | 'delete' | 'upsert' = 'update') {
  invalidateCache(table);
  emitDataChange(table, operation);
}
