/*
  # Event Websites System - Comprehensive Schema

  Creates the complete database structure for event-specific websites including:
  - Main website configuration
  - Pages and content management
  - Sponsors and media galleries
  - Documents and competitor profiles
  - News feeds and social media integration
  - Analytics tracking
  
  Security: RLS enabled with public read for published content, admin write access
*/

-- Create event_websites table
CREATE TABLE IF NOT EXISTS event_websites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public_events(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  slug text UNIQUE NOT NULL,
  custom_domain text UNIQUE,
  ssl_enabled boolean DEFAULT false,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  theme_config jsonb DEFAULT '{"primaryColor": "#3b82f6", "secondaryColor": "#1e40af", "fontFamily": "Inter"}'::jsonb,
  logo_url text,
  hero_image_url text,
  hero_video_url text,
  favicon_url text,
  meta_title text,
  meta_description text,
  meta_keywords text[],
  og_image_url text,
  features_enabled jsonb DEFAULT '{"liveResults": true, "liveTracking": true, "mediaGallery": true, "socialFeed": true, "registration": true}'::jsonb,
  navigation_config jsonb DEFAULT '[]'::jsonb,
  analytics_code text,
  visitor_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS event_website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  page_type text DEFAULT 'custom' CHECK (page_type IN ('home', 'about', 'schedule', 'results', 'media', 'sponsors', 'competitors', 'news', 'contact', 'custom')),
  content_blocks jsonb DEFAULT '[]'::jsonb,
  template_id text,
  is_published boolean DEFAULT false,
  show_in_navigation boolean DEFAULT true,
  navigation_order integer DEFAULT 0,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, slug)
);

CREATE TABLE IF NOT EXISTS event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier text DEFAULT 'supporter' CHECK (tier IN ('title', 'platinum', 'gold', 'silver', 'bronze', 'supporter')),
  logo_url text NOT NULL,
  website_url text,
  description text,
  display_order integer DEFAULT 0,
  impression_count integer DEFAULT 0,
  click_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_website_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  media_type text CHECK (media_type IN ('image', 'video', 'youtube', 'album')),
  media_url text NOT NULL,
  thumbnail_url text,
  gallery_name text DEFAULT 'General',
  race_day integer,
  uploaded_by_user_id uuid REFERENCES auth.users(id),
  is_featured boolean DEFAULT false,
  is_approved boolean DEFAULT true,
  view_count integer DEFAULT 0,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_website_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_type text CHECK (document_type IN ('nor', 'si', 'amendment', 'notice', 'results', 'protest', 'other')),
  file_url text NOT NULL,
  file_size integer,
  file_type text,
  version text,
  is_published boolean DEFAULT false,
  download_count integer DEFAULT 0,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_website_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  sail_number text NOT NULL,
  skipper_name text NOT NULL,
  crew_names text[],
  boat_class text NOT NULL,
  boat_name text,
  country text,
  club_name text,
  bio text,
  profile_image_url text,
  boat_image_url text,
  social_media jsonb,
  is_featured boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_website_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL,
  excerpt text,
  featured_image_url text,
  author_id uuid REFERENCES profiles(id),
  category text DEFAULT 'announcement' CHECK (category IN ('race-report', 'announcement', 'feature', 'interview', 'results')),
  is_published boolean DEFAULT false,
  is_featured boolean DEFAULT false,
  view_count integer DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, slug)
);

CREATE TABLE IF NOT EXISTS event_website_social_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('twitter', 'instagram', 'facebook', 'youtube')),
  post_id text NOT NULL,
  content text,
  author_name text,
  author_handle text,
  media_urls text[],
  post_url text,
  posted_at timestamptz,
  is_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform, post_id)
);

CREATE TABLE IF NOT EXISTS event_website_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE,
  date date NOT NULL,
  page_views integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  avg_session_duration integer DEFAULT 0,
  bounce_rate numeric(5,2) DEFAULT 0,
  top_pages jsonb DEFAULT '{}'::jsonb,
  referrer_sources jsonb DEFAULT '{}'::jsonb,
  device_breakdown jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, date)
);

CREATE TABLE IF NOT EXISTS event_website_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE UNIQUE,
  registration_enabled boolean DEFAULT false,
  registration_url text,
  live_scoring_enabled boolean DEFAULT true,
  live_tracking_enabled boolean DEFAULT true,
  media_upload_enabled boolean DEFAULT false,
  social_feed_enabled boolean DEFAULT false,
  social_feed_hashtags text[],
  comments_enabled boolean DEFAULT false,
  newsletter_signup_enabled boolean DEFAULT false,
  contact_email text,
  social_links jsonb DEFAULT '{}'::jsonb,
  maintenance_mode boolean DEFAULT false,
  maintenance_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_websites_event_id ON event_websites(event_id);
CREATE INDEX IF NOT EXISTS idx_event_websites_slug ON event_websites(slug);
CREATE INDEX IF NOT EXISTS idx_event_websites_custom_domain ON event_websites(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_websites_status ON event_websites(status);
CREATE INDEX IF NOT EXISTS idx_event_website_pages_website_id ON event_website_pages(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_pages_slug ON event_website_pages(event_website_id, slug);
CREATE INDEX IF NOT EXISTS idx_event_website_pages_type ON event_website_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_event_sponsors_website_id ON event_sponsors(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_sponsors_tier ON event_sponsors(tier);
CREATE INDEX IF NOT EXISTS idx_event_website_media_website_id ON event_website_media(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_media_gallery ON event_website_media(gallery_name);
CREATE INDEX IF NOT EXISTS idx_event_website_media_featured ON event_website_media(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_event_website_documents_website_id ON event_website_documents(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_documents_type ON event_website_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_event_website_competitors_website_id ON event_website_competitors(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_competitors_member_id ON event_website_competitors(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_website_news_website_id ON event_website_news(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_news_published ON event_website_news(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_website_social_website_id ON event_website_social_feed(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_social_approved ON event_website_social_feed(is_approved, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_website_analytics_website_date ON event_website_analytics(event_website_id, date DESC);

-- Enable RLS
ALTER TABLE event_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_social_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_website_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can view published event websites"
  ON event_websites FOR SELECT
  TO public
  USING (status = 'published' AND enabled = true);

CREATE POLICY "Admins can manage event websites"
  ON event_websites FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_websites.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view published pages"
  ON event_website_pages FOR SELECT
  TO public
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_pages.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage pages"
  ON event_website_pages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_pages.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view active sponsors"
  ON event_sponsors FOR SELECT
  TO public
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_sponsors.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage sponsors"
  ON event_sponsors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_sponsors.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view approved media"
  ON event_website_media FOR SELECT
  TO public
  USING (
    is_approved = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_media.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Users can upload media if enabled"
  ON event_website_media FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN event_website_settings ews ON ew.id = ews.event_website_id
      WHERE ew.id = event_website_media.event_website_id
      AND ews.media_upload_enabled = true
      AND ew.status = 'published'
    )
  );

CREATE POLICY "Admins can manage all media"
  ON event_website_media FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_media.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view published documents"
  ON event_website_documents FOR SELECT
  TO public
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_documents.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage documents"
  ON event_website_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_documents.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view competitors"
  ON event_website_competitors FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_competitors.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage competitors"
  ON event_website_competitors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_competitors.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view published news"
  ON event_website_news FOR SELECT
  TO public
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_news.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage news"
  ON event_website_news FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_news.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Public can view approved social posts"
  ON event_website_social_feed FOR SELECT
  TO public
  USING (
    is_approved = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_social_feed.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage social feed"
  ON event_website_social_feed FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_social_feed.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "Admins can view analytics"
  ON event_website_analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_analytics.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

CREATE POLICY "System can insert analytics"
  ON event_website_analytics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Public can view settings for published sites"
  ON event_website_settings FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_settings.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins can manage settings"
  ON event_website_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      JOIN public_events pe ON ew.event_id = pe.id
      WHERE ew.id = event_website_settings.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-websites', 'event-websites', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view event website assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'event-websites');

CREATE POLICY "Authenticated users can upload event website assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'event-websites');

CREATE POLICY "Authenticated users can update event website assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'event-websites');

CREATE POLICY "Authenticated users can delete event website assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'event-websites');
