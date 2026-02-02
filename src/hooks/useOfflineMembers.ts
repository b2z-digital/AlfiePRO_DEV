import { useState, useEffect } from 'react';
import { Member } from '../types/member';
import { offlineStorage } from '../utils/offlineStorage';
import { supabase } from '../utils/supabase';

/**
 * Custom hook for accessing members with offline support
 *
 * This hook automatically caches members when online and provides
 * access to cached data when offline.
 */
export const useOfflineMembers = (clubId: string | null) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [lastCacheTime, setLastCacheTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!clubId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    loadMembers();

    // Subscribe to connection status changes
    const unsubscribe = offlineStorage.onConnectionChange((online) => {
      setIsOnline(online);

      // When coming back online, refresh members
      if (online) {
        loadMembers();
      }
    });

    return () => unsubscribe();
  }, [clubId]);

  const loadMembers = async () => {
    if (!clubId) return;

    setIsLoading(true);
    setError(null);

    try {
      const online = offlineStorage.getOnlineStatus();

      if (online) {
        // Try to fetch fresh data from Supabase
        try {
          const { data, error: supabaseError } = await supabase
            .from('members')
            .select('*')
            .eq('club_id', clubId)
            .order('last_name', { ascending: true });

          if (supabaseError) throw supabaseError;

          // Cache the members for offline use
          if (data) {
            await offlineStorage.cacheMembers(data as Member[]);
            setMembers(data as Member[]);
            setLastCacheTime(new Date());
          }
        } catch (err) {
          console.warn('Failed to fetch members from Supabase, using cache:', err);
          // Fall back to cached data
          const cachedMembers = await offlineStorage.getCachedMembers(clubId);
          setMembers(cachedMembers);
        }
      } else {
        // Offline - use cached data
        console.log('📴 Loading members from cache (offline mode)');
        const cachedMembers = await offlineStorage.getCachedMembers(clubId);
        setMembers(cachedMembers);
      }
    } catch (err) {
      console.error('Error loading members:', err);
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  };

  const searchMembers = async (query: string): Promise<Member[]> => {
    if (!clubId) return [];

    try {
      const online = offlineStorage.getOnlineStatus();

      if (online) {
        // Search in Supabase
        const { data, error: supabaseError } = await supabase
          .from('members')
          .select('*')
          .eq('club_id', clubId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .order('last_name', { ascending: true });

        if (supabaseError) throw supabaseError;
        return (data as Member[]) || [];
      } else {
        // Search in cached data
        return await offlineStorage.searchMembers(query, clubId);
      }
    } catch (err) {
      console.error('Error searching members:', err);
      // Fall back to offline search
      return await offlineStorage.searchMembers(query, clubId);
    }
  };

  const refreshMembers = async () => {
    if (clubId) {
      await loadMembers();
    }
  };

  return {
    members,
    isLoading,
    isOnline,
    error,
    lastCacheTime,
    searchMembers,
    refreshMembers
  };
};
