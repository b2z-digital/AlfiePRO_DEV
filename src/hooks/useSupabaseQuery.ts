import { useState, useEffect, useCallback, useRef } from 'react';
import { retryQuery } from '../utils/supabase';
import { onDataChange } from '../utils/dataEvents';

interface UseSupabaseQueryOptions<T> {
  queryFn: () => Promise<{ data: T | null; error: any }>;
  dependencies?: any[];
  enabled?: boolean;
  onError?: (error: any) => void;
  retry?: boolean;
  /** Tables to watch - auto-refetches when any listed table is mutated */
  invalidateOn?: string[];
}

export function useSupabaseQuery<T>({
  queryFn,
  dependencies = [],
  enabled = true,
  onError,
  retry = true,
  invalidateOn
}: UseSupabaseQueryOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = retry
        ? await retryQuery<T>(queryFn)
        : await queryFn();

      if (!isMountedRef.current) return;

      if (result.error) {
        setError(result.error);
        if (onError) {
          onError(result.error);
        }
      } else {
        setData(result.data);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err);
      if (onError) {
        onError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [queryFn, enabled, retry, onError]);

  useEffect(() => {
    isMountedRef.current = true;
    refetch();
    return () => { isMountedRef.current = false; };
  }, [refetch, ...dependencies]);

  // Auto-refetch when watched tables are mutated
  useEffect(() => {
    if (!invalidateOn || invalidateOn.length === 0) return;

    const unsubscribe = onDataChange((table) => {
      if (invalidateOn.includes(table)) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (isMountedRef.current && enabled) {
            refetch();
          }
        }, 150);
      }
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [invalidateOn, refetch, enabled]);

  return { data, error, loading, refetch };
}
