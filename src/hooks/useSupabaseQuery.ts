import { useState, useEffect, useCallback } from 'react';
import { retryQuery } from '../utils/supabase';

interface UseSupabaseQueryOptions<T> {
  queryFn: () => Promise<{ data: T | null; error: any }>;
  dependencies?: any[];
  enabled?: boolean;
  onError?: (error: any) => void;
  retry?: boolean;
}

export function useSupabaseQuery<T>({
  queryFn,
  dependencies = [],
  enabled = true,
  onError,
  retry = true
}: UseSupabaseQueryOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = retry
        ? await retryQuery<T>(queryFn)
        : await queryFn();

      if (result.error) {
        setError(result.error);
        if (onError) {
          onError(result.error);
        }
      } else {
        setData(result.data);
      }
    } catch (err) {
      setError(err);
      if (onError) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [queryFn, enabled, retry, onError]);

  useEffect(() => {
    refetch();
  }, [refetch, ...dependencies]);

  return { data, error, loading, refetch };
}
