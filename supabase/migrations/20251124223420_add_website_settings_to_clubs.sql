/*
  # Add Website Settings to Clubs Table
  
  1. New Columns
    - `seo_title` (text) - Site title for SEO
    - `seo_description` (text) - Default meta description
    - `allow_indexing` (boolean) - Whether to allow search engine indexing
    - `google_analytics_id` (text) - Google Analytics tracking ID
    - `default_share_image` (text) - Default social share image URL
    - `default_share_description` (text) - Default social share description
    - `facebook_pixel_id` (text) - Facebook Pixel ID for tracking
    - `twitter_handle` (text) - Club's Twitter/X handle
  
  2. Purpose
    - Store website configuration settings for clubs
    - Enable SEO optimization
    - Track analytics and social sharing settings
*/

-- Add website settings columns to clubs table
ALTER TABLE public.clubs
ADD COLUMN IF NOT EXISTS seo_title text,
ADD COLUMN IF NOT EXISTS seo_description text,
ADD COLUMN IF NOT EXISTS allow_indexing boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS google_analytics_id text,
ADD COLUMN IF NOT EXISTS default_share_image text,
ADD COLUMN IF NOT EXISTS default_share_description text,
ADD COLUMN IF NOT EXISTS facebook_pixel_id text,
ADD COLUMN IF NOT EXISTS twitter_handle text;

-- Add comments for documentation
COMMENT ON COLUMN public.clubs.seo_title IS 'Site title for SEO and page titles';
COMMENT ON COLUMN public.clubs.seo_description IS 'Default meta description for pages without specific descriptions';
COMMENT ON COLUMN public.clubs.allow_indexing IS 'Whether search engines should index the website';
COMMENT ON COLUMN public.clubs.google_analytics_id IS 'Google Analytics tracking ID';
COMMENT ON COLUMN public.clubs.default_share_image IS 'Default image URL for social media sharing';
COMMENT ON COLUMN public.clubs.default_share_description IS 'Default description for social media shares';
COMMENT ON COLUMN public.clubs.facebook_pixel_id IS 'Facebook Pixel ID for conversion tracking';
COMMENT ON COLUMN public.clubs.twitter_handle IS 'Twitter/X handle for social card attribution';
