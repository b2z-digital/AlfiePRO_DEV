/*
  # Website Management System Enhancement

  ## Overview
  This migration creates comprehensive website management tables for club websites including:
  - Custom pages with draft/publish workflow
  - Activity logging for admin actions
  - Server-side analytics tracking
  - Website theme customization settings

  ## New Tables

  ### `website_pages`
  Stores custom pages created by club admins
  - `id` (uuid, primary key)
  - `club_id` (uuid, references clubs)
  - `title` (text) - Page title
  - `slug` (text) - URL-friendly identifier
  - `content` (jsonb) - Page content/sections
  - `status` (text) - draft, published, archived
  - `meta_title` (text) - SEO meta title
  - `meta_description` (text) - SEO meta description
  - `author_id` (uuid, references auth.users)
  - `published_at` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `website_activity_log`
  Tracks all changes made to website content by admins
  - `id` (uuid, primary key)
  - `club_id` (uuid, references clubs)
  - `user_id` (uuid, references auth.users)
  - `action` (text) - created, updated, published, deleted
  - `entity_type` (text) - page, navigation, theme, homepage
  - `entity_id` (uuid) - Reference to the modified entity
  - `entity_name` (text) - Name/title of the entity
  - `details` (jsonb) - Additional context about the change
  - `created_at` (timestamptz)

  ### `website_analytics`
  Server-side analytics tracking without external dependencies
  - `id` (uuid, primary key)
  - `club_id` (uuid, references clubs)
  - `page_path` (text) - URL path visited
  - `visitor_id` (text) - Anonymous visitor identifier
  - `session_id` (text) - Session identifier
  - `referrer` (text) - Referring URL
  - `user_agent` (text) - Browser user agent
  - `ip_address` (inet) - Visitor IP (for unique visitor counting)
  - `duration` (integer) - Time spent on page in seconds
  - `created_at` (timestamptz)

  ### `website_theme_settings`
  Stores theme customization per club
  - `id` (uuid, primary key)
  - `club_id` (uuid, references clubs, unique)
  - `template` (text) - Selected template name
  - `primary_color` (text) - Primary brand color
  - `secondary_color` (text) - Secondary brand color
  - `accent_color` (text) - Accent color
  - `font_heading` (text) - Heading font family
  - `font_body` (text) - Body font family
  - `custom_css` (text) - Custom CSS overrides
  - `updated_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Admins can manage pages for their clubs
  - Analytics are write-only for public, read-only for admins
  - Activity logs are read-only for admins, write by system
*/

-- Create website_pages table
CREATE TABLE IF NOT EXISTS website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  content jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  meta_title text,
  meta_description text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, slug)
);

-- Create website_activity_log table
CREATE TABLE IF NOT EXISTS website_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'published', 'deleted', 'unpublished')),
  entity_type text NOT NULL CHECK (entity_type IN ('page', 'navigation', 'theme', 'homepage')),
  entity_id uuid,
  entity_name text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create website_analytics table
CREATE TABLE IF NOT EXISTS website_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  page_path text NOT NULL,
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  referrer text,
  user_agent text,
  ip_address inet,
  duration integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create website_theme_settings table
CREATE TABLE IF NOT EXISTS website_theme_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL UNIQUE,
  template text DEFAULT 'default' NOT NULL,
  primary_color text DEFAULT '#1e40af',
  secondary_color text DEFAULT '#64748b',
  accent_color text DEFAULT '#22c55e',
  font_heading text DEFAULT 'Inter',
  font_body text DEFAULT 'Inter',
  custom_css text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_website_pages_club_id ON website_pages(club_id);
CREATE INDEX IF NOT EXISTS idx_website_pages_status ON website_pages(status);
CREATE INDEX IF NOT EXISTS idx_website_pages_slug ON website_pages(club_id, slug);

CREATE INDEX IF NOT EXISTS idx_website_activity_log_club_id ON website_activity_log(club_id);
CREATE INDEX IF NOT EXISTS idx_website_activity_log_created_at ON website_activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_analytics_club_id ON website_analytics(club_id);
CREATE INDEX IF NOT EXISTS idx_website_analytics_created_at ON website_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_analytics_visitor ON website_analytics(visitor_id);

-- Enable Row Level Security
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_theme_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for website_pages
CREATE POLICY "Admins can view pages for their clubs"
  ON website_pages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_pages.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can create pages for their clubs"
  ON website_pages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_pages.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update pages for their clubs"
  ON website_pages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_pages.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete pages for their clubs"
  ON website_pages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_pages.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Public can view published pages"
  ON website_pages FOR SELECT
  TO anon
  USING (status = 'published');

-- RLS Policies for website_activity_log
CREATE POLICY "Admins can view activity for their clubs"
  ON website_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_activity_log.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert activity logs"
  ON website_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for website_analytics
CREATE POLICY "Admins can view analytics for their clubs"
  ON website_analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_analytics.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Public can record analytics"
  ON website_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- RLS Policies for website_theme_settings
CREATE POLICY "Admins can view theme settings for their clubs"
  ON website_theme_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_theme_settings.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can manage theme settings for their clubs"
  ON website_theme_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = website_theme_settings.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Public can view theme settings"
  ON website_theme_settings FOR SELECT
  TO anon
  USING (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_website_pages_updated_at
  BEFORE UPDATE ON website_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_website_theme_settings_updated_at
  BEFORE UPDATE ON website_theme_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
