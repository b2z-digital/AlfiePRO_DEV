/*
  # Update default homepage slides and tiles to use relative URI paths

  1. Changes
    - Updates `create_default_homepage_tiles` function to use relative paths like `/race-calendar` instead of anchor links
    - Updates `create_default_homepage_slides` function to use relative paths instead of anchor links
    - Membership tile uses external URL `https://alfiepro.com.au/register`
    - All other tiles/slides use relative paths that work with any subdomain or custom domain

  2. URI Path Mapping
    - Membership: https://alfiepro.com.au/register (external)
    - Race Program: /race-calendar
    - Classes: /yacht-classes
    - Venue: /venues
    - News: /news
    - Classifieds: /classifieds

  3. Notes
    - Relative paths starting with `/` are resolved by the frontend via `buildPublicUrl()`
    - This ensures links work correctly regardless of the domain or subdomain assigned to the club
*/

-- Update the create_default_homepage_tiles function with relative URI paths
CREATE OR REPLACE FUNCTION create_default_homepage_tiles(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM homepage_tiles WHERE club_id = p_club_id
  ) THEN
    INSERT INTO homepage_tiles (club_id, title, description, image_url, link_url, display_order, is_active)
    VALUES
      (p_club_id, 'Membership', 'Join our club and become part of our sailing community', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png', 'https://alfiepro.com.au/register', 1, true),
      (p_club_id, 'Race Program', 'View our racing schedule and upcoming events', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png', '/race-calendar', 2, true),
      (p_club_id, 'Classes', 'Explore the yacht classes competing at our club', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png', '/yacht-classes', 3, true),
      (p_club_id, 'Venue', 'Learn about our facilities and location', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714334371_dgngg6.jpg', '/venues', 4, true),
      (p_club_id, 'News', 'Stay up to date with club news and announcements', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761799093766_43j26l.jpg', '/news', 5, true),
      (p_club_id, 'Classifieds', 'Browse boats and equipment for sale', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714523155_j2g5fj.jpg', '/classifieds', 6, true);
  END IF;
END;
$$;

-- Update the create_default_homepage_slides function with relative URI paths
CREATE OR REPLACE FUNCTION create_default_homepage_slides(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM homepage_slides WHERE club_id = p_club_id
  ) THEN
    INSERT INTO homepage_slides (club_id, title, subtitle, image_url, button_text, button_url, display_order, is_active)
    VALUES
      (p_club_id, 'Welcome to Our Club', 'Join us for exciting radio yacht racing', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png', 'View Calendar', '/race-calendar', 0, true),
      (p_club_id, 'Racing Calendar', 'View our upcoming races and events', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png', 'See Schedule', '/race-calendar', 1, true),
      (p_club_id, 'Yacht Classes', 'Discover the classes we race', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png', 'View Classes', '/yacht-classes', 2, true);
  END IF;
END;
$$;
