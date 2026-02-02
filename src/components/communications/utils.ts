import { supabase } from '../../utils/supabase';
import type { Notification, NotificationDraft } from './types';

// Auto-save draft with debouncing
export const saveDraft = async (draft: Partial<NotificationDraft>) => {
  try {
    const { data, error } = await supabase
      .from('notification_drafts')
      .upsert({
        ...draft,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error saving draft:', err);
    throw err;
  }
};

// Delete draft
export const deleteDraft = async (draftId: string) => {
  const { error } = await supabase
    .from('notification_drafts')
    .delete()
    .eq('id', draftId);

  if (error) throw error;
};

// Star/unstar notification
export const toggleStar = async (notificationId: string, isStarred: boolean) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_starred: !isStarred })
    .eq('id', notificationId);

  if (error) throw error;
};

// Archive/unarchive notification
export const toggleArchive = async (notificationId: string, isArchived: boolean) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_archived: !isArchived })
    .eq('id', notificationId);

  if (error) throw error;
};

// Add label to notification
export const addLabel = async (notificationId: string, label: string) => {
  const { data: notification } = await supabase
    .from('notifications')
    .select('labels')
    .eq('id', notificationId)
    .single();

  if (notification) {
    const labels = notification.labels || [];
    if (!labels.includes(label)) {
      const { error } = await supabase
        .from('notifications')
        .update({ labels: [...labels, label] })
        .eq('id', notificationId);

      if (error) throw error;
    }
  }
};

// Remove label from notification
export const removeLabel = async (notificationId: string, label: string) => {
  const { data: notification } = await supabase
    .from('notifications')
    .select('labels')
    .eq('id', notificationId)
    .single();

  if (notification) {
    const labels = (notification.labels || []).filter((l: string) => l !== label);
    const { error } = await supabase
      .from('notifications')
      .update({ labels })
      .eq('id', notificationId);

    if (error) throw error;
  }
};

// Add reaction
export const addReaction = async (
  notificationId: string,
  userId: string,
  emoji: string
) => {
  const { error } = await supabase.from('notification_reactions').insert({
    notification_id: notificationId,
    user_id: userId,
    emoji,
  });

  if (error && error.code !== '23505') {
    // 23505 is unique violation (already reacted)
    throw error;
  }
};

// Remove reaction
export const removeReaction = async (reactionId: string) => {
  const { error} = await supabase
    .from('notification_reactions')
    .delete()
    .eq('id', reactionId);

  if (error) throw error;
};

// Get reactions for notification
export const getReactions = async (notificationId: string) => {
  const { data, error } = await supabase
    .from('notification_reactions')
    .select(`
      *,
      profiles:user_id (
        first_name,
        last_name,
        avatar_url
      )
    `)
    .eq('notification_id', notificationId);

  if (error) throw error;
  return data;
};

// Mark as read with timestamp
export const markAsRead = async (notificationId: string, userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw error;
};

// Mark as opened (for analytics)
export const markAsOpened = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('opened_at', null);

  if (error) throw error;
};

// Bulk mark as read
export const bulkMarkAsRead = async (notificationIds: string[], userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .in('id', notificationIds)
    .eq('user_id', userId);

  if (error) throw error;
};

// Bulk delete
export const bulkDelete = async (notificationIds: string[]) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .in('id', notificationIds);

  if (error) throw error;
};

// Bulk archive
export const bulkArchive = async (notificationIds: string[]) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_archived: true })
    .in('id', notificationIds);

  if (error) throw error;
};

// Full-text search
export const searchNotifications = async (
  query: string,
  clubId: string,
  userId: string
) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .textSearch('search_vector', query)
    .order('sent_at', { ascending: false });

  if (error) throw error;
  return data;
};

// Get thread messages
export const getThreadMessages = async (threadId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true });

  if (error) throw error;
  return data;
};

// Upload attachment
export const uploadAttachment = async (
  file: File,
  notificationId: string,
  userId: string
) => {
  const fileName = `${Date.now()}_${file.name}`;
  const filePath = `notifications/${notificationId}/${fileName}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  // Create attachment record
  const { data, error } = await supabase
    .from('notification_attachments')
    .insert({
      notification_id: notificationId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Get attachment URL
export const getAttachmentUrl = async (filePath: string) => {
  const { data } = supabase.storage.from('media').getPublicUrl(filePath);
  return data.publicUrl;
};

// Format date for display
export const formatMessageDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    const minutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  } else if (diffInHours < 24) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else if (diffInHours < 168) {
    // 7 days
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
};

// Extract mentions from text
export const extractMentions = (text: string): string[] => {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[2]); // The user ID
  }

  return mentions;
};

// Replace mention tags with display text
export const renderMentions = (text: string): string => {
  return text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '<span class="text-blue-400 font-medium">@$1</span>');
};

// Check if user is in quiet hours
export const isInQuietHours = (preferences: any): boolean => {
  if (!preferences?.quiet_hours_enabled) return false;

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = preferences.quiet_hours_start.split(':').map(Number);
  const [endHour, endMin] = preferences.quiet_hours_end.split(':').map(Number);

  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime < endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    // Quiet hours span midnight
    return currentTime >= startTime || currentTime <= endTime;
  }
};

// Request desktop notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Show desktop notification
export const showDesktopNotification = (
  title: string,
  options?: NotificationOptions
) => {
  if (Notification.permission === 'granted') {
    new Notification(title, options);
  }
};
