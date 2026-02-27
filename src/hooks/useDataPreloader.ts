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

    try {
      const stats: PreloadStats = {
        events: 0,
        series: 0,
        members: 0,
        articles: 0,
        tasks: 0,
        meetings: 0
      };

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

      const db = await offlineStorage.getDB();

      if (seriesData.status === 'fulfilled' && seriesData.value.data) {
        try {
          const transaction = db.transaction('series', 'readwrite');
          const store = transaction.objectStore('series');

          for (const series of seriesData.value.data) {
            await new Promise<void>((resolve, reject) => {
              const request = store.put({ ...series, timestamp: Date.now() });
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
            stats.series++;
          }
        } catch (e) {
          console.error('Error caching series:', e);
        }
      }

      if (membersData.status === 'fulfilled' && membersData.value.data) {
        await offlineStorage.cacheMembers(membersData.value.data as any);
        stats.members = membersData.value.data.length;
      }

      if (articlesData.status === 'fulfilled' && articlesData.value.data) {
        try {
          const transaction = db.transaction('articles', 'readwrite');
          const store = transaction.objectStore('articles');

          for (const article of articlesData.value.data) {
            await new Promise<void>((resolve, reject) => {
              const request = store.put(article);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          }
          stats.articles = articlesData.value.data.length;
        } catch (e) {
          console.error('Error caching articles:', e);
        }
      }

      if (meetingsData.status === 'fulfilled' && meetingsData.value.data) {
        try {
          const transaction = db.transaction('meetings', 'readwrite');
          const store = transaction.objectStore('meetings');

          for (const meeting of meetingsData.value.data) {
            await new Promise<void>((resolve, reject) => {
              const request = store.put(meeting);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            });
          }
          stats.meetings = meetingsData.value.data.length;
        } catch (e) {
          console.error('Error caching meetings:', e);
        }
      }

      setPreloadStats(stats);
      setLastPreloadTime(new Date());
    } catch (error) {
      console.error('Error preloading data:', error);
    } finally {
      setIsPreloading(false);
    }
  };

  return {
    isPreloading,
    preloadStats,
    lastPreloadTime,
    preloadData
  };
};
