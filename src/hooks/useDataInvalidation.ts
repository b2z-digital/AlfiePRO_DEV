import { useEffect, useRef, useState } from 'react';
import { onDataChange } from '../utils/dataEvents';

/**
 * Hook that triggers a callback when specified tables are mutated.
 * Use this to auto-refetch data after any mutation anywhere in the app.
 *
 * @param tables - Array of table names to watch (e.g., ['members', 'clubs'])
 * @param callback - Function to call when a watched table changes
 * @param debounceMs - Debounce window to batch rapid changes (default 150ms)
 */
export function useDataInvalidation(
  tables: string[],
  callback: () => void,
  debounceMs: number = 150
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesRef = useRef(tables);

  callbackRef.current = callback;
  tablesRef.current = tables;

  useEffect(() => {
    const unsubscribe = onDataChange((table, _operation) => {
      const watching = tablesRef.current;
      if (watching.length === 0 || watching.includes(table)) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          callbackRef.current();
        }, debounceMs);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [debounceMs]);
}

/**
 * Returns a counter that increments on every mutation to watched tables.
 * Add this to your useEffect dependency array to auto-refetch.
 *
 * @param tables - Tables to watch. Pass empty array [] to watch ALL mutations.
 *
 * @example
 * const refreshKey = useRefreshKey(['members', 'clubs']);
 * useEffect(() => { loadData(); }, [clubId, refreshKey]);
 */
export function useRefreshKey(tables: string[] = []): number {
  const [key, setKey] = useState(0);
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onDataChange((table) => {
      const watching = tablesRef.current;
      if (watching.length === 0 || watching.includes(table)) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setKey(k => k + 1), 150);
      }
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return key;
}
