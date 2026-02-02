import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

export const useRaceCalendar = (limit: number = 5) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true })
          .limit(limit);

        if (error) throw error;
        setEvents(data || []);
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [limit]);

  return { events, loading };
};

export const useLatestArticles = (count: number = 3) => {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const { data, error } = await supabase
          .from('articles')
          .select('*')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(count);

        if (error) throw error;
        setArticles(data || []);
      } catch (error) {
        console.error('Error fetching articles:', error);
        setArticles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [count]);

  return { articles, loading };
};

export const useLatestMedia = (limit: number = 12) => {
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const { data, error } = await supabase
          .from('media_items')
          .select('*')
          .eq('type', 'image')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        setMedia(data || []);
      } catch (error) {
        console.error('Error fetching media:', error);
        setMedia([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [limit]);

  return { media, loading };
};

export const useRaceResults = (limit: number = 10) => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        // This would fetch from your races/events table
        // For now, return empty array
        setResults([]);
      } catch (error) {
        console.error('Error fetching results:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [limit]);

  return { results, loading };
};
