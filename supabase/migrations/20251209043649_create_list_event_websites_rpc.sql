/*
  # Create RPC Function to List Event Websites
  
  1. Problem
    - Direct SELECT on event_websites triggers RLS causing stack depth errors
  
  2. Solution
    - Create RPC function that bypasses RLS
    - Returns all event websites the user can access
*/

-- Create RPC function to list event websites
CREATE OR REPLACE FUNCTION public.list_event_websites_for_user()
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
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    -- Return only published websites for anonymous users
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
    WHERE ew.status = 'published' AND ew.enabled = true
    ORDER BY ew.created_at DESC;
    RETURN;
  END IF;
  
  -- Check if user is admin in any club
  SELECT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_clubs.user_id = v_user_id
    AND user_clubs.role IN ('admin', 'super_admin')
  ) INTO v_is_admin;
  
  -- If admin, return all websites
  IF v_is_admin THEN
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
    ORDER BY ew.created_at DESC;
    RETURN;
  END IF;
  
  -- Otherwise, return only published websites
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
  WHERE ew.status = 'published' AND ew.enabled = true
  ORDER BY ew.created_at DESC;
END;
$$;