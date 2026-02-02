/*
  # Fix All Club Creation Trigger Functions

  1. Changes
    - Fix search_path for create_default_homepage_tiles function
    - Ensures all trigger functions can see the tables they need

  2. Security
    - Maintains SECURITY DEFINER
    - Sets proper search_path to public schema
*/

-- Fix create_default_homepage_tiles function
CREATE OR REPLACE FUNCTION public.create_default_homepage_tiles(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Only create default tiles if the club has no tiles yet
  IF NOT EXISTS (
    SELECT 1 FROM public.homepage_tiles WHERE club_id = p_club_id
  ) THEN
    -- Insert 6 default tiles
    INSERT INTO public.homepage_tiles (club_id, title, description, image_url, link_url, display_order, is_active)
    VALUES
      (p_club_id, 'Membership', 'Join our club and become part of our sailing community', 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=800&h=600&fit=crop', '#membership', 1, true),
      (p_club_id, 'Race Program', 'View our racing schedule and upcoming events', 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=800&h=600&fit=crop', '#races', 2, true),
      (p_club_id, 'Classes', 'Explore the yacht classes competing at our club', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=600&fit=crop', '#classes', 3, true),
      (p_club_id, 'Venue', 'Learn about our facilities and location', 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop', '#venue', 4, true),
      (p_club_id, 'News', 'Stay up to date with club news and announcements', 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=600&fit=crop', '#news', 5, true),
      (p_club_id, 'Classifieds', 'Browse boats and equipment for sale', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&h=600&fit=crop', '#classifieds', 6, true);
  END IF;
END;
$$;
