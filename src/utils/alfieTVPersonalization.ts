import { supabase } from './supabase';

export interface ViewingHistory {
  id: string;
  user_id: string;
  video_id: string;
  channel_id?: string;
  watch_duration_seconds: number;
  video_duration_seconds?: number;
  completion_percentage?: number;
  watched_at: string;
}

export interface UserPreference {
  id: string;
  user_id: string;
  category: string;
  preference_score: number;
  view_count: number;
  avg_completion_rate: number;
  last_viewed_at?: string;
  updated_at: string;
}

export interface VideoCategory {
  id: string;
  video_id: string;
  category: string;
}

export const VIDEO_CATEGORIES = [
  'RC Yachts',
  'Full Size Yachting',
  'Racing',
  'Tutorials',
  'Building & Maintenance',
  'Cruising',
  'Match Racing',
  'One Design',
  'Equipment Reviews',
  'General Sailing'
] as const;

export type VideoCategory = typeof VIDEO_CATEGORIES[number];

/**
 * Track a video view
 */
export async function trackVideoView(
  videoId: string,
  channelId: string | null,
  watchDurationSeconds: number,
  videoDurationSeconds?: number
) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'User not authenticated' };
  }

  const { data, error } = await supabase
    .from('alfie_tv_viewing_history')
    .insert({
      user_id: user.id,
      video_id: videoId,
      channel_id: channelId,
      watch_duration_seconds: watchDurationSeconds,
      video_duration_seconds: videoDurationSeconds
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Get user's viewing preferences
 */
export async function getUserPreferences() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'User not authenticated' };
  }

  const { data, error } = await supabase
    .from('alfie_tv_user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .order('preference_score', { ascending: false });

  return { data, error };
}

/**
 * Get personalized video recommendations
 */
export async function getPersonalizedVideos(limit = 20, offset = 0) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Return default videos for non-authenticated users
    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .select('*')
      .eq('is_approved', true)
      .order('view_count', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    return { data, error };
  }

  // Get personalized recommendations using the database function
  const { data: recommendations, error: recError } = await supabase
    .rpc('get_personalized_videos', {
      p_user_id: user.id,
      p_limit: limit,
      p_offset: offset
    });

  if (recError) {
    console.error('Error getting personalized videos:', recError);
    // Fallback to popular videos
    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .select('*')
      .eq('is_approved', true)
      .order('view_count', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    return { data, error };
  }

  // Get full video details for recommended videos
  const videoIds = recommendations?.map((r: any) => r.video_id) || [];

  if (videoIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('alfie_tv_videos')
    .select('*')
    .in('id', videoIds)
    .eq('is_approved', true);

  // Sort by recommendation order
  const sortedData = videoIds.map(id =>
    data?.find(v => v.id === id)
  ).filter(Boolean);

  return { data: sortedData, error };
}

/**
 * Get video categories
 */
export async function getVideoCategories(videoId: string) {
  const { data, error } = await supabase
    .from('alfie_tv_video_categories')
    .select('category')
    .eq('video_id', videoId);

  return { data: data?.map(d => d.category) || [], error };
}

/**
 * Add category to video (admin only)
 */
export async function addVideoCategory(videoId: string, category: string) {
  const { data, error } = await supabase
    .from('alfie_tv_video_categories')
    .insert({
      video_id: videoId,
      category
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Remove category from video (admin only)
 */
export async function removeVideoCategory(videoId: string, category: string) {
  const { error } = await supabase
    .from('alfie_tv_video_categories')
    .delete()
    .eq('video_id', videoId)
    .eq('category', category);

  return { error };
}

/**
 * Get user's viewing history
 */
export async function getViewingHistory(limit = 50) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'User not authenticated' };
  }

  const { data, error } = await supabase
    .from('alfie_tv_viewing_history')
    .select(`
      *,
      video:alfie_tv_videos(*)
    `)
    .eq('user_id', user.id)
    .order('watched_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Auto-categorize a video based on title and description
 */
export function autoDetectCategories(title: string, description: string): string[] {
  const categories: string[] = [];
  const text = `${title} ${description}`.toLowerCase();

  if (text.match(/\b(rc|radio control|r\/c)\b/)) {
    categories.push('RC Yachts');
  }
  if (text.match(/\b(full size|offshore|ocean race|america's cup|volvo)\b/)) {
    categories.push('Full Size Yachting');
  }
  if (text.match(/\b(race|racing|regatta|championship)\b/)) {
    categories.push('Racing');
  }
  if (text.match(/\b(tutorial|how to|guide|learn|lesson)\b/)) {
    categories.push('Tutorials');
  }
  if (text.match(/\b(build|construction|diy|repair|maintenance)\b/)) {
    categories.push('Building & Maintenance');
  }
  if (text.match(/\b(cruise|cruising|voyage|passage)\b/)) {
    categories.push('Cruising');
  }
  if (text.match(/\b(match race|match racing)\b/)) {
    categories.push('Match Racing');
  }
  if (text.match(/\b(one design|class racing|j\/70|420|laser)\b/)) {
    categories.push('One Design');
  }
  if (text.match(/\b(review|test|equipment|gear)\b/)) {
    categories.push('Equipment Reviews');
  }

  // If no specific category matched, add general sailing
  if (categories.length === 0) {
    categories.push('General Sailing');
  }

  return categories;
}
