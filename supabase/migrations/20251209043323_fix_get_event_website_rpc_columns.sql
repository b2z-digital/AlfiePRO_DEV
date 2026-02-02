/*
  # Fix RPC Function Column References
  
  1. Problem
    - Function references custom_name column that doesn't exist
    - Causing 400 errors when called
  
  2. Solution
    - Update function to only select existing columns
    - Match actual event_websites table schema
*/

-- Drop and recreate with correct columns
DROP FUNCTION IF EXISTS public.get_event_website_for_user(uuid);

CREATE OR REPLACE FUNCTION public.get_event_website_for_user(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  website_name text,
  slug text,
  custom_domain text,
  meta_title text,
  meta_description text,
  google_analytics_id text,
  enabled boolean,
  status text,
  theme_config jsonb,
  logo_url text,
  hero_image_url text,
  hero_video_url text,
  favicon_url text,
  meta_keywords text[],
  og_image_url text,
  features_enabled jsonb,
  navigation_config jsonb,
  analytics_code text,
  visitor_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  website_published boolean,
  view_count integer,
  subdomain_slug text,
  ssl_enabled boolean,
  domain_status text,
  dns_verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user has access
  v_has_access := public.user_can_access_event_website(p_event_id, v_user_id);
  
  -- If no access and not published, return empty
  IF NOT v_has_access THEN
    RETURN QUERY
    SELECT 
      ew.id, ew.event_id, ew.website_name, ew.slug, ew.custom_domain,
      ew.meta_title, ew.meta_description, ew.google_analytics_id,
      ew.enabled, ew.status, ew.theme_config, ew.logo_url,
      ew.hero_image_url, ew.hero_video_url, ew.favicon_url,
      ew.meta_keywords, ew.og_image_url, ew.features_enabled,
      ew.navigation_config, ew.analytics_code, ew.visitor_count,
      ew.created_at, ew.updated_at, ew.published_at,
      ew.website_published, ew.view_count, ew.subdomain_slug,
      ew.ssl_enabled, ew.domain_status::text, ew.dns_verified_at
    FROM event_websites ew
    WHERE ew.event_id = p_event_id
    AND ew.status = 'published'
    AND ew.enabled = true;
    RETURN;
  END IF;
  
  -- User has access, return the website
  RETURN QUERY
  SELECT 
    ew.id, ew.event_id, ew.website_name, ew.slug, ew.custom_domain,
    ew.meta_title, ew.meta_description, ew.google_analytics_id,
    ew.enabled, ew.status, ew.theme_config, ew.logo_url,
    ew.hero_image_url, ew.hero_video_url, ew.favicon_url,
    ew.meta_keywords, ew.og_image_url, ew.features_enabled,
    ew.navigation_config, ew.analytics_code, ew.visitor_count,
    ew.created_at, ew.updated_at, ew.published_at,
    ew.website_published, ew.view_count, ew.subdomain_slug,
    ew.ssl_enabled, ew.domain_status::text, ew.dns_verified_at
  FROM event_websites ew
  WHERE ew.event_id = p_event_id;
END;
$$;