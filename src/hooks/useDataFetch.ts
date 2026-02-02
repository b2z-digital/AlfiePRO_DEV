import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';

interface UseDataFetchOptions<T> {
  fetchFn: () => Promise<T>;
  dependencies?: any[];
  timeout?: number;
  autoRetry?: boolean;
  maxRetries?: number;
}

interface UseDataFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDataFetch<T>({
  fetchFn,
  dependencies = [],
  timeout = 10000,
  autoRetry = true,
  maxRetries = 2,
}: UseDataFetchOptions<T>): UseDataFetchReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const isMounted = useRef(true);

  // Check if Supabase connection is stale
  const checkConnectionHealth = async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from('profiles').select('count').limit(1);
      return !error;
    } catch {
      return false;
    }
  };

  const fetchData = useCallback(async (isRetry = false) => {
    if (!isMounted.current) return;

    try {
      setLoading(true);
      setError(null);

      // Check connection health before fetching
      const isHealthy = await checkConnectionHealth();
      if (!isHealthy) {
        console.warn('Supabase connection appears stale, attempting reconnection...');
        // Force a new Supabase client connection by reloading
        if (retryCount.current >= maxRetries) {
          console.error('Connection remained stale after retries, forcing page reload...');
          setError('Connection lost. Reloading page...');
          setTimeout(() => window.location.reload(), 1500);
          return;
        }
      }

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // Race between fetch and timeout
      const result = await Promise.race([fetchFn(), timeoutPromise]);

      if (isMounted.current) {
        setData(result as T);
        retryCount.current = 0; // Reset retry count on success
      }
    } catch (err) {
      console.error('Data fetch error:', err);

      if (!isMounted.current) return;

      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';

      // Handle timeout or connection errors
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Load failed')
      ) {
        if (autoRetry && retryCount.current < maxRetries) {
          retryCount.current++;
          console.log(`Retrying... Attempt ${retryCount.current} of ${maxRetries}`);
          setError(`Connection issue. Retrying (${retryCount.current}/${maxRetries})...`);
          setTimeout(() => fetchData(true), 1000 * retryCount.current);
        } else {
          console.error('Max retries reached. Forcing page reload...');
          setError('Connection issue detected. Reloading page...');
          setTimeout(() => window.location.reload(), 2000);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [fetchFn, timeout, autoRetry, maxRetries]);

  const refetch = useCallback(async () => {
    retryCount.current = 0;
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();

    return () => {
      isMounted.current = false;
    };
  }, dependencies);

  return { data, loading, error, refetch };
}
