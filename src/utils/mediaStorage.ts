import { supabase } from './supabase';
import { EventMedia } from '../types/media';

export const createEventMedia = async (mediaData: Omit<EventMedia, 'id' | 'created_at' | 'updated_at'>): Promise<EventMedia | null> => {
  try {
    const { data, error } = await supabase
      .from('event_media')
      .insert(mediaData)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating event media:', error);
    return null;
  }
};

export const getEventMedia = async (clubId: string, eventId?: string, eventName?: string, mediaType?: 'image' | 'youtube_video'): Promise<EventMedia[]> => {
  try {
    let query = supabase
      .from('event_media')
      .select('*')
      .eq('club_id', clubId);

    if (eventId) {
      // For rounds with composite IDs, match by event_name instead
      if (eventId.includes('-round-')) {
        if (eventName) {
          query = query.eq('event_name', eventName);
        }
      } else {
        // For regular events, match by event_ref_id
        query = query.eq('event_ref_id', eventId);
      }
    }

    if (mediaType) {
      query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching event media:', error);
    return [];
  }
};

export const updateEventMedia = async (mediaId: string, updates: Partial<EventMedia>): Promise<EventMedia | null> => {
  try {
    const { data, error } = await supabase
      .from('event_media')
      .update(updates)
      .eq('id', mediaId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating event media:', error);
    return null;
  }
};

export const deleteEventMedia = async (mediaId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('event_media')
      .delete()
      .eq('id', mediaId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting event media:', error);
    return false;
  }
};

export const getClubMediaStats = async (clubId: string) => {
  try {
    const { data, error } = await supabase
      .from('event_media')
      .select('media_type, event_name, race_class')
      .eq('club_id', clubId);

    if (error) throw error;

    const stats = {
      totalMedia: data?.length || 0,
      images: data?.filter(m => m.media_type === 'image').length || 0,
      videos: data?.filter(m => m.media_type === 'youtube_video').length || 0,
      uniqueEvents: new Set(data?.map(m => m.event_name).filter(Boolean)).size,
      uniqueClasses: new Set(data?.map(m => m.race_class).filter(Boolean)).size
    };

    return stats;
  } catch (error) {
    console.error('Error fetching media stats:', error);
    return {
      totalMedia: 0,
      images: 0,
      videos: 0,
      uniqueEvents: 0,
      uniqueClasses: 0
    };
  }
};