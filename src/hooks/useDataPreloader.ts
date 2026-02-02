import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { offlineStorage } from '../utils/offlineStorage';

interface PreloadStats {
  events: number;
  series: number;
  members: number;
  articles: number;
  tasks: number;
  meetings: number;
}

export const useDataPreloader = () => {
  const { currentClub, user } = useAuth();
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadStats, setPreloadStats] = useState<PreloadStats>({
    events: 0,
    series: 0,
    members: 0,
    articles: 0,
    tasks: 0,
    meetings: 0
  });
  const [lastPreloadTime, setLastPreloadTime] = useState<Date | null>(null);

  useEffect(() => {
    if (currentClub?.clubId && user && navigator.onLine) {
      preloadData();

      const interval = setInterval(() => {
        if (navigator.onLine) {
          preloadData();
        }
      }, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [currentClub?.clubId, user]);

  const preloadData = async () => {
    if (!currentClub?.clubId || isPreloading) return;

    setIsPreloading(true);
    console.log('🔄 Starting data preload for offline access...');

    try {
      const stats: PreloadStats = {
        events: 0,
        series: 0,
        members: 0,
        articles: 0,
        tasks: 0,
        meetings: 0
      };

      // Note: Using Promise.allSettled to handle missing tables gracefully
      const [eventsData, seriesData, membersData, articlesData, meetingsData] = await Promise.allSettled([
        supabase.from('quick_races').select('*').eq('club_id', currentClub.clubId),
        supabase.from('race_series').select('*').eq('club_id', currentClub.clubId),
        supabase.from('members').select('*').eq('club_id', currentClub.clubId),
        supabase.from('articles').select('*').eq('club_id', currentClub.clubId).order('created_at', { ascending: false }).limit(50),
        supabase.from('meetings').select('*').eq('club_id', currentClub.clubId).order('date', { ascending: false }).limit(20)
      ]);

      if (eventsData.status === 'fulfilled' && eventsData.value.data) {
        for (const event of eventsData.value.data) {
          await offlineStorage.saveEvent(event as any, true);
          stats.events++;
        }
      }

      if (seriesData.status === 'fulfilled' && seriesData.value.data) {
        // Cache series in IndexedDB without triggering sync
        const db = await openIndexedDB();
        const transaction = db.transaction('series', 'readwrite');
        const store = transaction.objectStore('series');

        for (const series of seriesData.value.data) {
          await new Promise((resolve, reject) => {
            const request = store.put({ ...series, timestamp: Date.now() });
            request.onsuccess = () => resolve(undefined);
            request.onerror = () => reject(request.error);
          });
          stats.series++;
        }
      }

      if (membersData.status === 'fulfilled' && membersData.value.data) {
        await offlineStorage.cacheMembers(membersData.value.data as any);
        stats.members = membersData.value.data.length;
      }

      if (articlesData.status === 'fulfilled' && articlesData.value.data) {
        await cacheArticles(articlesData.value.data);
        stats.articles = articlesData.value.data.length;
      }

      if (meetingsData.status === 'fulfilled' && meetingsData.value.data) {
        await cacheMeetings(meetingsData.value.data);
        stats.meetings = meetingsData.value.data.length;
      }

      setPreloadStats(stats);
      setLastPreloadTime(new Date());
      console.log('✅ Data preload complete:', stats);
    } catch (error) {
      console.error('❌ Error preloading data:', error);
    } finally {
      setIsPreloading(false);
    }
  };

  const cacheArticles = async (articles: any[]) => {
    const db = await openIndexedDB();
    const transaction = db.transaction('articles', 'readwrite');
    const store = transaction.objectStore('articles');

    for (const article of articles) {
      await new Promise((resolve, reject) => {
        const request = store.put(article);
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    }
  };

  const cacheMeetings = async (meetings: any[]) => {
    const db = await openIndexedDB();
    const transaction = db.transaction('meetings', 'readwrite');
    const store = transaction.objectStore('meetings');

    for (const meeting of meetings) {
      await new Promise((resolve, reject) => {
        const request = store.put(meeting);
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    }
  };

  const openIndexedDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('alfie_pro_offline', 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('articles')) {
          const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
          articleStore.createIndex('clubId', 'club_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('clubId', 'club_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('meetings')) {
          const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
          meetingStore.createIndex('clubId', 'club_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('series')) {
          const seriesStore = db.createObjectStore('series', { keyPath: 'id' });
          seriesStore.createIndex('clubId', 'club_id', { unique: false });
        }
      };
    });
  };

  return {
    isPreloading,
    preloadStats,
    lastPreloadTime,
    preloadData
  };
};
