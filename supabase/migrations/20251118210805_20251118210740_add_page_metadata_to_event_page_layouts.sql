/*
  # Add Page Metadata to Event Page Layouts

  ## Summary
  Adds comprehensive page management fields to event_page_layouts table to enable full page configuration including homepage designation, publishing controls, and navigation settings.

  ## Changes

  ### New Columns Added to `event_page_layouts`:
  - `title` (text) - Human-readable page title
  - `page_type` (text) - Page type for categorization (home, about, schedule, etc.)
  - `is_homepage` (boolean) - Designates this page as the default homepage
  - `is_published` (boolean) - Controls page visibility to public
  - `show_in_navigation` (boolean) - Controls whether page appears in menu
  - `navigation_order` (integer) - Order in navigation menu
  - `seo_title` (text, nullable) - SEO meta title
  - `seo_description` (text, nullable) - SEO meta description

  ## Important Notes
  - Only one page per event_website can be marked as homepage (enforced by unique partial index)
  - All existing pages default to published and visible in navigation
  - Homepage pages default to page_type 'home'
  - Navigation order defaults to position in creation sequence
*/

-- Add new columns to event_page_layouts
DO $$
BEGIN
  -- Add title column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'title'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN title text NOT NULL DEFAULT 'Untitled Page';
  END IF;

  -- Add page_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'page_type'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN page_type text NOT NULL DEFAULT 'custom';
  END IF;

  -- Add is_homepage column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'is_homepage'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN is_homepage boolean NOT NULL DEFAULT false;
  END IF;

  -- Add is_published column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'is_published'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN is_published boolean NOT NULL DEFAULT true;
  END IF;

  -- Add show_in_navigation column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'show_in_navigation'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN show_in_navigation boolean NOT NULL DEFAULT true;
  END IF;

  -- Add navigation_order column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'navigation_order'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN navigation_order integer NOT NULL DEFAULT 0;
  END IF;

  -- Add seo_title column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'seo_title'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN seo_title text;
  END IF;

  -- Add seo_description column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'event_page_layouts'
    AND column_name = 'seo_description'
  ) THEN
    ALTER TABLE event_page_layouts ADD COLUMN seo_description text;
  END IF;
END $$;

-- Update existing pages with appropriate titles based on slugs
UPDATE event_page_layouts
SET title = CASE
  WHEN page_slug = '/home' OR page_slug = 'home' THEN 'Homepage'
  WHEN page_slug = '/sponsors' OR page_slug = 'sponsors' THEN 'Sponsors'
  ELSE INITCAP(REPLACE(REPLACE(page_slug, '/', ''), '-', ' '))
END
WHERE title = 'Untitled Page';

-- Update page_type for pages with recognizable slugs
UPDATE event_page_layouts
SET page_type = CASE
  WHEN page_slug IN ('/home', 'home', '/') THEN 'home'
  WHEN page_slug IN ('/about', 'about') THEN 'about'
  WHEN page_slug IN ('/schedule', 'schedule') THEN 'schedule'
  WHEN page_slug IN ('/results', 'results') THEN 'results'
  WHEN page_slug IN ('/media', 'media') THEN 'media'
  WHEN page_slug IN ('/sponsors', 'sponsors') THEN 'sponsors'
  WHEN page_slug IN ('/competitors', 'competitors') THEN 'competitors'
  WHEN page_slug IN ('/news', 'news') THEN 'news'
  WHEN page_slug IN ('/contact', 'contact') THEN 'contact'
  ELSE 'custom'
END;

-- Mark pages with 'home' slug as homepage
UPDATE event_page_layouts
SET is_homepage = true
WHERE page_slug IN ('/home', 'home', '/');

-- Create unique partial index to ensure only one homepage per event website
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_page_layouts_one_homepage_per_website
  ON event_page_layouts (event_website_id)
  WHERE is_homepage = true;

-- Add check constraint for valid page types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'valid_page_type'
    AND table_name = 'event_page_layouts'
  ) THEN
    ALTER TABLE event_page_layouts
    ADD CONSTRAINT valid_page_type
    CHECK (page_type IN ('home', 'about', 'schedule', 'results', 'media', 'sponsors', 'competitors', 'news', 'contact', 'custom'));
  END IF;
END $$;