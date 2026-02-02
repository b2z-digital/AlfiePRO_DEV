// Types for the enhanced communications system

export interface Notification {
  id: string;
  user_id: string;
  club_id: string | null;
  type: string;
  subject: string;
  body: string;
  read: boolean;
  sent_at: string;
  email_status: string;
  email_error_message: string | null;
  sender_name?: string;
  sender_avatar_url?: string;
  recipient_name?: string;
  recipient_avatar_url?: string;
  parent_id?: string | null;
  thread_id?: string | null;
  status?: string;
  scheduled_for?: string | null;
  is_starred?: boolean;
  is_archived?: boolean;
  labels?: string[];
  read_at?: string | null;
  opened_at?: string | null;
  mentions?: string[];
  is_rich_text?: boolean;
  attachments?: NotificationAttachment[];
  reactions?: NotificationReaction[];
  reply_count?: number;
}

export interface NotificationAttachment {
  id: string;
  notification_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface NotificationReaction {
  id: string;
  notification_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

export interface NotificationDraft {
  id: string;
  user_id: string;
  club_id: string;
  recipients: string[];
  recipient_groups: string[];
  subject: string;
  body: string;
  type: string;
  send_email: boolean;
  is_rich_text: boolean;
  attachments: any[];
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplate {
  id: string;
  club_id: string;
  created_by: string;
  name: string;
  description: string;
  subject: string;
  body: string;
  type: string;
  is_rich_text: boolean;
  is_global: boolean;
  category: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface RecipientGroup {
  id: string;
  club_id: string;
  name: string;
  description: string;
  is_dynamic: boolean;
  dynamic_filter: any;
  created_by: string;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationPreferences {
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  desktop_notifications: boolean;
  sound_enabled: boolean;
  digest_mode: boolean;
  digest_frequency: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  muted_threads: string[];
  muted_users: string[];
}

export interface Member {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

export type TabType = 'inbox' | 'sent' | 'drafts' | 'scheduled' | 'archived' | 'compose';
export type FilterType = 'all' | 'unread' | 'starred' | 'mentions' | string;
export type SortType = 'date-desc' | 'date-asc' | 'sender' | 'subject';
