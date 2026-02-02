/*
  # Comprehensive Advertising System

  ## Overview
  Complete advertising platform with targeting, analytics, and multiple ad formats
  including Google AdSense integration for SuperAdmin users.

  ## New Tables
  
  ### Advertisers
  - `advertisers` - Companies/organizations placing ads
    - `id` (uuid, primary key)
    - `name` (text) - Company name
    - `contact_name` (text) - Contact person
    - `contact_email` (text) - Email address
    - `contact_phone` (text) - Phone number
    - `website_url` (text) - Company website
    - `logo_url` (text) - Company logo
    - `notes` (text) - Internal notes
    - `is_active` (boolean) - Active status
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ### Ad Campaigns
  - `ad_campaigns` - Individual advertising campaigns
    - `id` (uuid, primary key)
    - `advertiser_id` (uuid, foreign key)
    - `name` (text) - Campaign name
    - `description` (text) - Campaign description
    - `pricing_model` (text) - 'flat_rate' or 'cpm'
    - `flat_rate_amount` (decimal) - For flat rate pricing
    - `cpm_rate` (decimal) - Cost per thousand impressions
    - `budget_impressions` (integer) - Max impressions
    - `budget_clicks` (integer) - Max clicks
    - `start_date` (date)
    - `end_date` (date)
    - `is_active` (boolean)
    - `priority` (integer) - Display priority (higher = more frequent)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ### Ad Banners
  - `ad_banners` - Actual banner creative
    - `id` (uuid, primary key)
    - `campaign_id` (uuid, foreign key)
    - `name` (text) - Banner name
    - `ad_type` (text) - 'image', 'html5', 'adsense', 'text'
    - `image_url` (text) - For image banners
    - `html_content` (text) - For HTML5 banners
    - `adsense_code` (text) - For AdSense
    - `text_content` (jsonb) - For text ads {headline, body, cta}
    - `link_url` (text) - Click-through URL
    - `size_width` (integer) - Width in pixels
    - `size_height` (integer) - Height in pixels
    - `is_active` (boolean)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ### Ad Placements
  - `ad_placements` - Available ad zones
    - `id` (uuid, primary key)
    - `name` (text) - Placement name
    - `description` (text)
    - `page_type` (text) - 'event_calendar', 'media', 'yacht_classes', 'alfie_tv', 'my_garage', 'weather', 'all'
    - `position` (text) - 'header', 'sidebar', 'inline', 'footer'
    - `size_width` (integer)
    - `size_height` (integer)
    - `is_active` (boolean)
    - `created_at` (timestamptz)

  ### Campaign Targeting
  - `ad_campaign_targeting` - Targeting rules
    - `id` (uuid, primary key)
    - `campaign_id` (uuid, foreign key)
    - `target_type` (text) - 'state', 'club', 'membership_tier', 'device'
    - `target_value` (text) - Actual target value
    - `created_at` (timestamptz)

  ### Campaign Placements
  - `ad_campaign_placements` - Links campaigns to placements
    - `id` (uuid, primary key)
    - `campaign_id` (uuid, foreign key)
    - `placement_id` (uuid, foreign key)
    - `weight` (integer) - Rotation weight
    - `created_at` (timestamptz)

  ### Ad Impressions
  - `ad_impressions` - View tracking
    - `id` (uuid, primary key)
    - `banner_id` (uuid, foreign key)
    - `campaign_id` (uuid, foreign key)
    - `placement_id` (uuid, foreign key)
    - `user_id` (uuid, foreign key to auth.users) - Nullable
    - `club_id` (uuid) - Nullable
    - `state` (text) - Geographic location
    - `device_type` (text) - 'desktop', 'mobile', 'tablet'
    - `page_url` (text)
    - `user_agent` (text)
    - `ip_address` (text)
    - `session_id` (text) - For frequency capping
    - `viewed_at` (timestamptz)

  ### Ad Clicks
  - `ad_clicks` - Click tracking
    - `id` (uuid, primary key)
    - `banner_id` (uuid, foreign key)
    - `campaign_id` (uuid, foreign key)
    - `placement_id` (uuid, foreign key)
    - `impression_id` (uuid, foreign key) - Nullable
    - `user_id` (uuid, foreign key to auth.users) - Nullable
    - `club_id` (uuid) - Nullable
    - `state` (text)
    - `device_type` (text)
    - `page_url` (text)
    - `clicked_at` (timestamptz)

  ## Security
  - All tables have RLS enabled
  - Only SuperAdmin users can manage advertising
  - Public can view active ads (impressions/clicks recorded anonymously)
*/

-- Create advertisers table
CREATE TABLE IF NOT EXISTS advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  website_url text,
  logo_url text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage advertisers"
  ON advertisers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create ad_campaigns table
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid REFERENCES advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  pricing_model text CHECK (pricing_model IN ('flat_rate', 'cpm')) DEFAULT 'flat_rate',
  flat_rate_amount decimal(10, 2),
  cpm_rate decimal(10, 2),
  budget_impressions integer,
  budget_clicks integer,
  current_impressions integer DEFAULT 0,
  current_clicks integer DEFAULT 0,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage campaigns"
  ON ad_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view active campaigns for display"
  ON ad_campaigns
  FOR SELECT
  USING (
    is_active = true
    AND (start_date IS NULL OR start_date <= CURRENT_DATE)
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );

-- Create ad_banners table
CREATE TABLE IF NOT EXISTS ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  ad_type text CHECK (ad_type IN ('image', 'html5', 'adsense', 'text')) DEFAULT 'image',
  image_url text,
  html_content text,
  adsense_code text,
  text_content jsonb,
  link_url text,
  size_width integer,
  size_height integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ad_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage banners"
  ON ad_banners
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view active banners for display"
  ON ad_banners
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE ad_campaigns.id = ad_banners.campaign_id
      AND ad_campaigns.is_active = true
      AND (ad_campaigns.start_date IS NULL OR ad_campaigns.start_date <= CURRENT_DATE)
      AND (ad_campaigns.end_date IS NULL OR ad_campaigns.end_date >= CURRENT_DATE)
    )
  );

-- Create ad_placements table
CREATE TABLE IF NOT EXISTS ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  page_type text CHECK (page_type IN ('event_calendar', 'media', 'yacht_classes', 'alfie_tv', 'my_garage', 'weather', 'news', 'results', 'all')) DEFAULT 'all',
  position text CHECK (position IN ('header', 'sidebar', 'inline', 'footer', 'hero')) DEFAULT 'sidebar',
  size_width integer NOT NULL,
  size_height integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage placements"
  ON ad_placements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view active placements"
  ON ad_placements
  FOR SELECT
  USING (is_active = true);

-- Create ad_campaign_targeting table
CREATE TABLE IF NOT EXISTS ad_campaign_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  target_type text CHECK (target_type IN ('state', 'club', 'membership_tier', 'device', 'page_type')) NOT NULL,
  target_value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_campaign_targeting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage targeting"
  ON ad_campaign_targeting
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view targeting for matching"
  ON ad_campaign_targeting
  FOR SELECT
  USING (true);

-- Create ad_campaign_placements table
CREATE TABLE IF NOT EXISTS ad_campaign_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  placement_id uuid REFERENCES ad_placements(id) ON DELETE CASCADE,
  weight integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, placement_id)
);

ALTER TABLE ad_campaign_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage campaign placements"
  ON ad_campaign_placements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view campaign placements"
  ON ad_campaign_placements
  FOR SELECT
  USING (true);

-- Create ad_impressions table (partitioned by date for performance)
CREATE TABLE IF NOT EXISTS ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid REFERENCES ad_banners(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  placement_id uuid REFERENCES ad_placements(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid,
  state text,
  device_type text CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  page_url text,
  user_agent text,
  ip_address text,
  session_id text,
  viewed_at timestamptz DEFAULT now()
);

ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can view impressions"
  ON ad_impressions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Anyone can record impressions"
  ON ad_impressions
  FOR INSERT
  WITH CHECK (true);

-- Create ad_clicks table
CREATE TABLE IF NOT EXISTS ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid REFERENCES ad_banners(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  placement_id uuid REFERENCES ad_placements(id) ON DELETE SET NULL,
  impression_id uuid REFERENCES ad_impressions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid,
  state text,
  device_type text CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  page_url text,
  clicked_at timestamptz DEFAULT now()
);

ALTER TABLE ad_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can view clicks"
  ON ad_clicks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Anyone can record clicks"
  ON ad_clicks
  FOR INSERT
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active ON ad_campaigns(is_active, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ad_banners_campaign ON ad_banners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_targeting_campaign ON ad_campaign_targeting(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_campaign ON ad_campaign_placements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_placement ON ad_campaign_placements(placement_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_banner ON ad_impressions(banner_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_campaign ON ad_impressions(campaign_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_viewed_at ON ad_impressions(viewed_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_banner ON ad_clicks(banner_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_campaign ON ad_clicks(campaign_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_clicked_at ON ad_clicks(clicked_at);

-- Create function to update campaign counters
CREATE OR REPLACE FUNCTION update_campaign_impression_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ad_campaigns
  SET current_impressions = current_impressions + 1
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_campaign_click_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ad_campaigns
  SET current_clicks = current_clicks + 1
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_impression_count ON ad_impressions;
CREATE TRIGGER trigger_update_impression_count
  AFTER INSERT ON ad_impressions
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_impression_count();

DROP TRIGGER IF EXISTS trigger_update_click_count ON ad_clicks;
CREATE TRIGGER trigger_update_click_count
  AFTER INSERT ON ad_clicks
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_click_count();

-- Create storage bucket for ad images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-banners', 'ad-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "SuperAdmins can upload ad banners"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "SuperAdmins can update ad banners"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "SuperAdmins can delete ad banners"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ad-banners'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Public can view ad banners"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ad-banners');

-- Insert default placements
INSERT INTO ad_placements (name, description, page_type, position, size_width, size_height) VALUES
  ('Event Calendar - Header Banner', 'Top banner on Event Calendar page', 'event_calendar', 'header', 728, 90),
  ('Event Calendar - Sidebar', 'Sidebar ad on Event Calendar page', 'event_calendar', 'sidebar', 300, 250),
  ('Media - Header Banner', 'Top banner on Media page', 'media', 'header', 728, 90),
  ('Media - Inline', 'Between media items', 'media', 'inline', 300, 250),
  ('Yacht Classes - Sidebar', 'Sidebar on Yacht Classes page', 'yacht_classes', 'sidebar', 300, 600),
  ('AlfieTV - Hero', 'Large banner in hero section', 'alfie_tv', 'hero', 970, 250),
  ('AlfieTV - Sidebar', 'Sidebar on AlfieTV page', 'alfie_tv', 'sidebar', 300, 250),
  ('MyGarage - Sidebar', 'Sidebar on MyGarage page', 'my_garage', 'sidebar', 300, 250),
  ('Weather - Sidebar', 'Sidebar on Weather page', 'weather', 'sidebar', 300, 250),
  ('News - Inline', 'Between news articles', 'news', 'inline', 300, 250),
  ('Results - Sidebar', 'Sidebar on Results page', 'results', 'sidebar', 160, 600),
  ('Global - Footer', 'Footer banner across all pages', 'all', 'footer', 728, 90)
ON CONFLICT DO NOTHING;