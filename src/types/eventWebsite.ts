export interface EventWebsite {
  id: string;
  event_id: string;
  enabled: boolean;
  website_name: string | null;
  slug: string;
  custom_domain: string | null;
  ssl_enabled: boolean;
  status: 'draft' | 'published' | 'archived';
  theme_config: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    headerStyle?: string;
    buttonStyle?: string;
  };
  logo_url: string | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  favicon_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  og_image_url: string | null;
  features_enabled: {
    liveResults: boolean;
    liveTracking: boolean;
    mediaGallery: boolean;
    socialFeed: boolean;
    registration: boolean;
  };
  navigation_config: NavigationItem[];
  analytics_code: string | null;
  google_analytics_id: string | null;
  visitor_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface NavigationItem {
  label: string;
  path: string;
  icon?: string;
  order: number;
}

export interface EventWebsitePage {
  id: string;
  event_website_id: string;
  title: string;
  slug: string;
  page_type: 'home' | 'about' | 'schedule' | 'results' | 'media' | 'sponsors' | 'competitors' | 'news' | 'contact' | 'custom';
  content_blocks: ContentBlock[];
  template_id: string | null;
  is_published: boolean;
  show_in_navigation: boolean;
  navigation_order: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentBlock {
  id: string;
  type: 'hero' | 'text' | 'image' | 'video' | 'gallery' | 'countdown' | 'schedule' | 'sponsors' | 'results' | 'news' | 'contact' | 'custom';
  content: any;
  settings?: {
    backgroundColor?: string;
    padding?: string;
    alignment?: 'left' | 'center' | 'right';
    fullWidth?: boolean;
  };
  order: number;
}

export interface EventSponsor {
  id: string;
  event_website_id: string;
  name: string;
  tier: 'title' | 'platinum' | 'gold' | 'silver' | 'bronze' | 'supporter';
  logo_url: string;
  website_url: string | null;
  description: string | null;
  display_order: number;
  impression_count: number;
  click_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventWebsiteMedia {
  id: string;
  event_website_id: string;
  title: string;
  description: string | null;
  media_type: 'image' | 'video' | 'youtube' | 'album';
  media_url: string;
  thumbnail_url: string | null;
  gallery_name: string;
  race_day: number | null;
  uploaded_by_user_id: string | null;
  is_featured: boolean;
  is_approved: boolean;
  view_count: number;
  display_order: number;
  created_at: string;
}

export interface EventWebsiteDocument {
  id: string;
  event_website_id: string;
  title: string;
  document_type: 'nor' | 'si' | 'amendment' | 'notice' | 'results' | 'protest' | 'other';
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  version: string | null;
  is_published: boolean;
  download_count: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventWebsiteCompetitor {
  id: string;
  event_website_id: string;
  member_id: string | null;
  sail_number: string;
  skipper_name: string;
  crew_names: string[] | null;
  boat_class: string;
  boat_name: string | null;
  country: string | null;
  club_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  boat_image_url: string | null;
  social_media: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
  } | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventWebsiteNews {
  id: string;
  event_website_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featured_image_url: string | null;
  author_id: string | null;
  category: 'race-report' | 'announcement' | 'feature' | 'interview' | 'results';
  is_published: boolean;
  is_featured: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventWebsiteSocialPost {
  id: string;
  event_website_id: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'youtube';
  post_id: string;
  content: string | null;
  author_name: string | null;
  author_handle: string | null;
  media_urls: string[] | null;
  post_url: string | null;
  posted_at: string | null;
  is_approved: boolean;
  created_at: string;
}

export interface EventWebsiteAnalytics {
  id: string;
  event_website_id: string;
  date: string;
  page_views: number;
  unique_visitors: number;
  avg_session_duration: number;
  bounce_rate: number;
  top_pages: Record<string, number>;
  referrer_sources: Record<string, number>;
  device_breakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  created_at: string;
}

export interface EventWebsiteSettings {
  id: string;
  event_website_id: string;
  registration_enabled: boolean;
  registration_url: string | null;
  live_scoring_enabled: boolean;
  live_tracking_enabled: boolean;
  media_upload_enabled: boolean;
  social_feed_enabled: boolean;
  social_feed_hashtags: string[] | null;
  comments_enabled: boolean;
  newsletter_signup_enabled: boolean;
  contact_email: string | null;
  social_links: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
  };
  maintenance_mode: boolean;
  maintenance_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventWebsiteTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail_url: string;
  category: 'championship' | 'regatta' | 'series' | 'custom';
  default_pages: Partial<EventWebsitePage>[];
  default_theme: EventWebsite['theme_config'];
}
