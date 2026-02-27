import { supabase } from './supabase';

export interface SocialPost {
  id: string;
  author_id: string;
  club_id?: string;
  group_id?: string;
  content: string;
  content_type: 'text' | 'image' | 'video' | 'link' | 'poll' | 'event';
  privacy: 'public' | 'friends' | 'group' | 'private';
  link_url?: string;
  link_title?: string;
  link_description?: string;
  link_image_url?: string;
  poll_options?: any;
  poll_votes?: any;
  poll_ends_at?: string;
  location?: string;
  feeling?: string;
  is_pinned: boolean;
  is_moderated: boolean;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  attachments?: SocialMediaAttachment[];
  user_reaction?: string;
}

export interface SocialComment {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id?: string;
  content: string;
  like_count: number;
  reply_count: number;
  is_moderated: boolean;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  replies?: SocialComment[];
}

export interface SocialGroup {
  id: string;
  name: string;
  description?: string;
  cover_image_url?: string;
  avatar_url?: string;
  group_type: 'club' | 'state' | 'national' | 'interest' | 'custom';
  visibility: 'public' | 'private' | 'secret';
  club_id?: string;
  state_association_id?: string;
  national_association_id?: string;
  created_by: string;
  require_approval: boolean;
  allow_member_posts: boolean;
  moderate_posts: boolean;
  member_count: number;
  post_count: number;
  created_at: string;
  user_membership?: {
    role: string;
    status: string;
  };
}

export interface SocialConnection {
  id: string;
  user_id: string;
  connected_user_id: string;
  connection_type: 'friend' | 'follow';
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  accepted_at?: string;
  connected_user?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface SocialMediaAttachment {
  id: string;
  post_id?: string;
  comment_id?: string;
  file_url: string;
  file_type: 'image' | 'video' | 'document';
  file_size?: number;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration?: number;
  created_at: string;
}

export interface SocialNotification {
  id: string;
  user_id: string;
  actor_id?: string;
  notification_type: string;
  post_id?: string;
  comment_id?: string;
  group_id?: string;
  title: string;
  message?: string;
  is_read: boolean;
  created_at: string;
  actor?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export const socialStorage = {
  async getFeed(options: {
    limit?: number;
    offset?: number;
    groupId?: string;
    privacy?: string[];
  } = {}) {
    const { limit = 20, offset = 0, groupId, privacy = ['public'] } = options;

    let query = supabase
      .from('social_posts')
      .select(`
        *,
        author:profiles(id, full_name, avatar_url),
        attachments:social_media_attachments(*)
      `)
      .eq('is_moderated', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (groupId) {
      query = query.eq('group_id', groupId);
    } else {
      query = query.in('privacy', privacy);
    }

    const { data, error } = await query;
    if (error) throw error;

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId && data) {
      const postIds = data.map(p => p.id);
      const { data: reactions } = await supabase
        .from('social_reactions')
        .select('post_id, reaction_type')
        .eq('user_id', userId)
        .in('post_id', postIds);

      const reactionMap = new Map(reactions?.map(r => [r.post_id, r.reaction_type]));

      return data.map(post => ({
        ...post,
        user_reaction: reactionMap.get(post.id)
      }));
    }

    return data;
  },

  async createPost(post: Partial<SocialPost>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_posts')
      .insert({
        ...post,
        author_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePost(postId: string, updates: Partial<SocialPost>) {
    const { data, error } = await supabase
      .from('social_posts')
      .update(updates)
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePost(postId: string) {
    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;
  },

  async getComments(postId: string) {
    const { data, error } = await supabase
      .from('social_comments')
      .select(`
        *,
        author:profiles!social_comments_author_id_fkey(id, full_name, avatar_url)
      `)
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  async createComment(comment: Partial<SocialComment>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_comments')
      .insert({
        ...comment,
        author_id: user.id
      })
      .select(`
        *,
        author:profiles!social_comments_author_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) throw error;
    return data;
  },

  async toggleReaction(postId: string, reactionType: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: existing } = await supabase
      .from('social_reactions')
      .select()
      .eq('user_id', user.id)
      .eq('post_id', postId)
      .maybeSingle();

    if (existing) {
      if (existing.reaction_type === reactionType) {
        await supabase
          .from('social_reactions')
          .delete()
          .eq('id', existing.id);
        return null;
      } else {
        const { data, error } = await supabase
          .from('social_reactions')
          .update({ reaction_type: reactionType })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } else {
      const { data, error } = await supabase
        .from('social_reactions')
        .insert({
          user_id: user.id,
          post_id: postId,
          reaction_type: reactionType
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async getGroups(options: { visibility?: string; userId?: string } = {}) {
    let query = supabase
      .from('social_groups')
      .select(`
        *,
        user_membership:social_group_members!inner(role, status),
        club:clubs!social_groups_club_id_fkey(id, name, abbreviation, logo)
      `)
      .order('name');

    if (options.visibility) {
      query = query.eq('visibility', options.visibility);
    }

    if (options.userId) {
      query = query.eq('social_group_members.user_id', options.userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async createGroup(group: Partial<SocialGroup>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_groups')
      .insert({
        ...group,
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('social_group_members')
      .insert({
        group_id: data.id,
        user_id: user.id,
        role: 'admin',
        status: 'active'
      });

    return data;
  },

  async joinGroup(groupId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async leaveGroup(groupId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('social_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user.id);

    if (error) throw error;
  },

  async getConnections(userId?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    if (!targetUserId) return [];

    const [outgoing, incoming] = await Promise.all([
      supabase
        .from('social_connections')
        .select(`*, connected_user:profiles!social_connections_connected_user_id_profiles_fkey(id, full_name, avatar_url, last_seen)`)
        .eq('user_id', targetUserId)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false }),
      supabase
        .from('social_connections')
        .select(`*, connected_user:profiles!social_connections_user_id_profiles_fkey(id, full_name, avatar_url, last_seen)`)
        .eq('connected_user_id', targetUserId)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false }),
    ]);

    if (outgoing.error) throw outgoing.error;
    if (incoming.error) throw incoming.error;

    const seen = new Set<string>();
    const all: any[] = [];
    for (const c of (outgoing.data || [])) {
      const otherId = c.connected_user_id;
      if (!seen.has(otherId)) {
        seen.add(otherId);
        all.push(c);
      }
    }
    for (const c of (incoming.data || [])) {
      const otherId = c.user_id;
      if (!seen.has(otherId)) {
        seen.add(otherId);
        all.push(c);
      }
    }
    return all;
  },

  async sendConnectionRequest(connectedUserId: string, type: 'friend' | 'follow' = 'friend') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_connections')
      .insert({
        user_id: user.id,
        connected_user_id: connectedUserId,
        connection_type: type,
        status: type === 'follow' ? 'accepted' : 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPendingConnectionRequests() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_connections')
      .select(`
        *,
        requester:profiles!social_connections_user_id_profiles_fkey(id, full_name, avatar_url)
      `)
      .eq('connected_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async acceptConnectionRequest(connectionId: string) {
    const { data, error } = await supabase
      .from('social_connections')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', connectionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async rejectConnectionRequest(connectionId: string) {
    const { error } = await supabase
      .from('social_connections')
      .delete()
      .eq('id', connectionId);

    if (error) throw error;
  },

  async updateGroup(groupId: string, updates: Partial<SocialGroup>) {
    const { data, error } = await supabase
      .from('social_groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteGroup(groupId: string) {
    const { error } = await supabase
      .from('social_groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;
  },

  async getClubGroups(clubId: string) {
    const { data, error } = await supabase
      .from('social_groups')
      .select('*')
      .eq('club_id', clubId)
      .order('name');

    if (error) throw error;
    return data;
  },

  async getNotifications(limit = 20) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('social_notifications')
      .select(`
        *,
        actor:profiles!social_notifications_actor_id_fkey(id, full_name, avatar_url)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  async markNotificationRead(notificationId: string) {
    const { error } = await supabase
      .from('social_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  },

  async uploadSocialMedia(file: File, folder: string = 'social') {
    let uploadFile: File = file;
    if (file.type.startsWith('image/')) {
      const { compressImage } = await import('./imageCompression');
      uploadFile = await compressImage(file, 'photo');
    }

    const fileExt = uploadFile.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('media')
      .upload(fileName, uploadFile);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(fileName);

    return publicUrl;
  },

  async createMediaAttachment(attachment: Partial<SocialMediaAttachment>) {
    const { data, error } = await supabase
      .from('social_media_attachments')
      .insert(attachment)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  subscribeToFeed(callback: (payload: any) => void) {
    const channel = supabase
      .channel('social-feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_posts'
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToNotifications(userId: string, callback: (payload: any) => void) {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_notifications',
          filter: `user_id=eq.${userId}`
        },
        callback
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};
