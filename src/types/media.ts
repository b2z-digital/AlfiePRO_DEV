export interface EventMedia {
  id: string;
  club_id: string;
  media_type: 'image' | 'youtube_video';
  url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  event_ref_id?: string;
  event_ref_type?: string;
  event_name?: string;
  race_class?: string;
  created_at: string;
  updated_at: string;
  isShared?: boolean;
  sharedFrom?: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string | null;
  };
  club?: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string | null;
  };
}

export interface SharedClubMedia {
  id: string;
  media_id: string;
  sharing_club_id: string;
  recipient_club_id: string;
  shared_by_user_id: string;
  message?: string;
  shared_at: string;
  created_at: string;
  updated_at: string;
}

export interface SocialShareData {
  platforms: string[];
  text: string;
  mediaItems: EventMedia[];
}

export interface VideoUploadData {
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
  eventId?: string;
  eventType?: string;
  eventName?: string;
  raceClass?: string;
}

export interface YouTubeVideo {
  id: string;
  url: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  published_at?: string;
  duration?: string;
}