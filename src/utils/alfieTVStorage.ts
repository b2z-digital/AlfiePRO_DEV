import { supabase } from './supabase';

export interface AlfieTVChannel {
  id: string;
  club_id: string | null;
  channel_url: string;
  channel_name: string;
  channel_id: string | null;
  auto_import: boolean;
  category?: string;
  is_visible: boolean;
  priority: number;
  channel_thumbnail: string | null;
  subscriber_count: number;
  video_count: number;
  channel_description: string | null;
  last_imported_at: string | null;
  is_global?: boolean;
  created_by_user_id?: string | null;
  created_by_role?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlfieTVVideo {
  id: string;
  youtube_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration: number;
  channel_id: string;
  youtube_playlist_id: string | null;
  boat_classes: string[];
  content_type: 'racing' | 'tuning' | 'building' | 'technique' | 'review' | 'regatta' | 'tutorial' | 'news' | 'other';
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'pro';
  view_count: number;
  like_count: number;
  published_at: string | null;
  is_featured: boolean;
  is_trending: boolean;
  is_live: boolean;
  is_upcoming: boolean;
  event_date: string | null;
  detected_keywords: string[];
  detected_year: number | null;
  average_rating: number;
  total_ratings: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  channel?: AlfieTVChannel;
  user_rating?: number;
  in_watchlist?: boolean;
  watch_progress?: {
    watch_position: number;
    completed: boolean;
  };
}

export interface AlfieTVPlaylist {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  club_id: string | null;
  is_public: boolean;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  video_count?: number;
}

export interface AlfieTVYouTubePlaylist {
  id: string;
  channel_id: string;
  youtube_playlist_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_count: number;
  playlist_category: 'live_events' | 'big_boat_yachting' | 'rc_yachting' | 'training_tips' | 'highlights_recaps' | 'event_archives' | 'general';
  is_featured: boolean;
  view_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlfieTVUserList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  youtube_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  channel_name: string;
  content_type: string;
  match_score: number;
}

export interface WatchHistory {
  user_id: string;
  video_id: string;
  watch_position: number;
  watch_duration: number;
  completed: boolean;
  last_watched_at: string;
}

export const alfieTVStorage = {
  // Channels
  async getChannels(clubId: string, visibleOnly = false): Promise<AlfieTVChannel[]> {
    let query = supabase
      .from('alfie_tv_channels')
      .select('*')
      .or(`club_id.eq.${clubId},is_global.eq.true`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (visibleOnly) {
      query = query.eq('is_visible', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async toggleChannelVisibility(channelId: string, isVisible: boolean): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_channels')
      .update({ is_visible: isVisible })
      .eq('id', channelId);

    if (error) throw error;
  },

  async createChannel(channel: Partial<AlfieTVChannel>): Promise<AlfieTVChannel> {
    const { data, error } = await supabase
      .from('alfie_tv_channels')
      .insert([channel])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateChannel(id: string, updates: Partial<AlfieTVChannel>): Promise<AlfieTVChannel> {
    const { data, error } = await supabase
      .from('alfie_tv_channels')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteChannel(id: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_channels')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Videos
  async getVideos(options?: {
    clubId?: string;
    channelId?: string;
    boatClass?: string;
    contentType?: string;
    skillLevel?: string;
    search?: string;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AlfieTVVideo[]> {
    let query = supabase
      .from('alfie_tv_videos')
      .select('*, alfie_tv_channels(*)')
      .order('published_at', { ascending: false });

    if (options?.channelId) {
      query = query.eq('channel_id', options.channelId);
    }

    if (options?.clubId) {
      const channelsQuery = await supabase
        .from('alfie_tv_channels')
        .select('id')
        .eq('club_id', options.clubId);

      if (channelsQuery.data) {
        const channelIds = channelsQuery.data.map(c => c.id);
        query = query.in('channel_id', channelIds);
      }
    }

    if (options?.boatClass) {
      query = query.contains('boat_classes', [options.boatClass]);
    }

    if (options?.contentType) {
      query = query.eq('content_type', options.contentType);
    }

    if (options?.skillLevel) {
      query = query.eq('skill_level', options.skillLevel);
    }

    if (options?.search) {
      query = query.or(`title.ilike.%${options.search}%,description.ilike.%${options.search}%`);
    }

    if (options?.featured) {
      query = query.eq('is_featured', true);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data?.map(item => ({
      ...item,
      channel: item.alfie_tv_channels
    })) || [];
  },

  async getVideo(id: string): Promise<AlfieTVVideo | null> {
    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .select('*, alfie_tv_channels(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? {
      ...data,
      channel: data.alfie_tv_channels
    } : null;
  },

  async createVideo(video: Partial<AlfieTVVideo>): Promise<AlfieTVVideo> {
    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .insert([video])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateVideo(id: string, updates: Partial<AlfieTVVideo>): Promise<AlfieTVVideo> {
    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteVideo(id: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_videos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggleVideoFeatured(videoId: string, isFeatured: boolean): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_videos')
      .update({ is_featured: isFeatured, updated_at: new Date().toISOString() })
      .eq('id', videoId);

    if (error) throw error;
  },

  async incrementViewCount(videoId: string): Promise<void> {
    await supabase.rpc('increment_video_views', { video_uuid: videoId });
  },

  // Watch History
  async getWatchHistory(userId: string, limit = 20): Promise<(WatchHistory & { video: AlfieTVVideo })[]> {
    const { data, error } = await supabase
      .from('alfie_tv_watch_history')
      .select('*, alfie_tv_videos(*)')
      .eq('user_id', userId)
      .order('last_watched_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data?.map(item => ({
      ...item,
      video: item.alfie_tv_videos
    })) || [];
  },

  async getContinueWatching(userId: string): Promise<(WatchHistory & { video: AlfieTVVideo })[]> {
    const { data, error } = await supabase
      .from('alfie_tv_watch_history')
      .select('*, alfie_tv_videos(*)')
      .eq('user_id', userId)
      .eq('completed', false)
      .gt('watch_position', 0)
      .order('last_watched_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data?.map(item => ({
      ...item,
      video: item.alfie_tv_videos
    })) || [];
  },

  async updateWatchHistory(userId: string, videoId: string, watchPosition: number, duration: number): Promise<void> {
    const completed = watchPosition >= duration * 0.9;

    const { error } = await supabase
      .from('alfie_tv_watch_history')
      .upsert({
        user_id: userId,
        video_id: videoId,
        watch_position: watchPosition,
        watch_duration: duration,
        completed,
        last_watched_at: new Date().toISOString()
      });

    if (error) throw error;
  },

  // Watchlist
  async getWatchlist(userId: string): Promise<AlfieTVVideo[]> {
    const { data, error } = await supabase
      .from('alfie_tv_watchlist')
      .select('*, alfie_tv_videos(*)')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => item.alfie_tv_videos).filter(Boolean) || [];
  },

  async addToWatchlist(userId: string, videoId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_watchlist')
      .insert([{ user_id: userId, video_id: videoId }]);

    if (error) throw error;
  },

  async removeFromWatchlist(userId: string, videoId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('video_id', videoId);

    if (error) throw error;
  },

  async isInWatchlist(userId: string, videoId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('alfie_tv_watchlist')
      .select('video_id')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  // Ratings
  async rateVideo(userId: string, videoId: string, rating: number): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_ratings')
      .upsert({
        user_id: userId,
        video_id: videoId,
        rating
      });

    if (error) throw error;
  },

  async getUserRating(userId: string, videoId: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('alfie_tv_ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .maybeSingle();

    if (error) throw error;
    return data?.rating || null;
  },

  async getAverageRating(videoId: string): Promise<number> {
    const { data, error } = await supabase
      .from('alfie_tv_ratings')
      .select('rating')
      .eq('video_id', videoId);

    if (error) throw error;
    if (!data || data.length === 0) return 0;

    const sum = data.reduce((acc, item) => acc + item.rating, 0);
    return sum / data.length;
  },

  // Playlists
  async getPlaylists(options?: {
    userId?: string;
    clubId?: string;
    publicOnly?: boolean;
  }): Promise<AlfieTVPlaylist[]> {
    let query = supabase
      .from('alfie_tv_playlists')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options?.clubId) {
      query = query.eq('club_id', options.clubId);
    }

    if (options?.publicOnly) {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async createPlaylist(playlist: Partial<AlfieTVPlaylist>): Promise<AlfieTVPlaylist> {
    const { data, error } = await supabase
      .from('alfie_tv_playlists')
      .insert([playlist])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePlaylist(id: string, updates: Partial<AlfieTVPlaylist>): Promise<AlfieTVPlaylist> {
    const { data, error } = await supabase
      .from('alfie_tv_playlists')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePlaylist(id: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_playlists')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getPlaylistVideos(playlistId: string): Promise<AlfieTVVideo[]> {
    const { data, error } = await supabase
      .from('alfie_tv_playlist_videos')
      .select('*, alfie_tv_videos(*)')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data?.map(item => item.alfie_tv_videos).filter(Boolean) || [];
  },

  async addToPlaylist(playlistId: string, videoId: string, position?: number): Promise<void> {
    if (position === undefined) {
      const { data } = await supabase
        .from('alfie_tv_playlist_videos')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      position = (data?.position || 0) + 1;
    }

    const { error } = await supabase
      .from('alfie_tv_playlist_videos')
      .insert([{ playlist_id: playlistId, video_id: videoId, position }]);

    if (error) throw error;
  },

  async removeFromPlaylist(playlistId: string, videoId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_playlist_videos')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('video_id', videoId);

    if (error) throw error;
  },

  // YouTube Playlists
  async getYouTubePlaylists(options?: {
    channelId?: string;
    category?: string;
    featured?: boolean;
  }): Promise<AlfieTVYouTubePlaylist[]> {
    let query = supabase
      .from('alfie_tv_youtube_playlists')
      .select('*')
      .order('view_count', { ascending: false });

    if (options?.channelId) {
      query = query.eq('channel_id', options.channelId);
    }

    if (options?.category) {
      query = query.eq('playlist_category', options.category);
    }

    if (options?.featured) {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async updateYouTubePlaylist(id: string, updates: Partial<AlfieTVYouTubePlaylist>): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_youtube_playlists')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  },

  // User Lists
  async getUserLists(userId: string): Promise<AlfieTVUserList[]> {
    const { data, error } = await supabase
      .from('alfie_tv_user_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createUserList(userId: string, name: string, description?: string, icon?: string): Promise<AlfieTVUserList> {
    const { data, error } = await supabase
      .from('alfie_tv_user_lists')
      .insert([{ user_id: userId, name, description, icon }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteUserList(listId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_user_lists')
      .delete()
      .eq('id', listId);

    if (error) throw error;
  },

  async getUserListVideos(listId: string): Promise<AlfieTVVideo[]> {
    const { data, error } = await supabase
      .from('alfie_tv_user_list_items')
      .select('*, alfie_tv_videos(*)')
      .eq('list_id', listId)
      .order('added_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => item.alfie_tv_videos).filter(Boolean) || [];
  },

  async addToUserList(listId: string, videoId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_user_list_items')
      .insert([{ list_id: listId, video_id: videoId }]);

    if (error) throw error;
  },

  async removeFromUserList(listId: string, videoId: string): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_user_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('video_id', videoId);

    if (error) throw error;
  },

  // Search
  async searchVideos(userId: string, query: string, limit = 50): Promise<SearchResult[]> {
    const { data, error } = await supabase
      .rpc('search_alfietv', {
        search_query: query,
        user_uuid: userId,
        result_limit: limit
      });

    if (error) throw error;
    return data || [];
  },

  async saveSearchHistory(userId: string, query: string, resultsCount: number): Promise<void> {
    const { error } = await supabase
      .from('alfie_tv_search_history')
      .insert([{
        user_id: userId,
        search_query: query,
        results_count: resultsCount
      }]);

    if (error) console.error('Error saving search history:', error);
  },

  async getRecentSearches(userId: string, limit = 10): Promise<string[]> {
    const { data, error } = await supabase
      .from('alfie_tv_search_history')
      .select('search_query')
      .eq('user_id', userId)
      .order('searched_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data?.map(item => item.search_query) || [];
  },

  // Trending/Featured
  async getTrendingVideos(clubId: string, limit = 10): Promise<AlfieTVVideo[]> {
    const channelsQuery = await supabase
      .from('alfie_tv_channels')
      .select('id')
      .or(`club_id.eq.${clubId},is_global.eq.true`)
      .eq('is_visible', true);

    if (!channelsQuery.data || channelsQuery.data.length === 0) return [];

    const channelIds = channelsQuery.data.map(c => c.id);

    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .select('*, alfie_tv_channels(*)')
      .in('channel_id', channelIds)
      .eq('is_trending', true)
      .order('view_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data?.map(item => ({
      ...item,
      channel: item.alfie_tv_channels
    })) || [];
  },

  async updateTrendingVideos(): Promise<void> {
    await supabase.rpc('update_trending_videos');
  },

  async getFeaturedVideos(clubId: string): Promise<AlfieTVVideo[]> {
    const channelsQuery = await supabase
      .from('alfie_tv_channels')
      .select('id')
      .or(`club_id.eq.${clubId},is_global.eq.true`);

    if (!channelsQuery.data || channelsQuery.data.length === 0) return [];

    const channelIds = channelsQuery.data.map(c => c.id);

    const { data, error } = await supabase
      .from('alfie_tv_videos')
      .select('*, alfie_tv_channels(*)')
      .in('channel_id', channelIds)
      .eq('is_featured', true)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      ...item,
      channel: item.alfie_tv_channels
    })) || [];
  },

  async getRecommendedVideos(userId: string, limit = 20): Promise<AlfieTVVideo[]> {
    const { data, error } = await supabase
      .rpc('get_recommended_videos', {
        user_uuid: userId,
        limit_count: limit
      });

    if (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
    return data || [];
  }
};
