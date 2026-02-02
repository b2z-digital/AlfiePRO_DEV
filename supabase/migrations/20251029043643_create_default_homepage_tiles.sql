/*
  # Create Default Homepage Tiles for All Clubs

  1. Changes
    - Creates a function to initialize 6 default tiles for any club that doesn't have tiles yet
    - Default tiles: Membership, Race Program, Classes, Venue, News, Classifieds
    - Each tile has placeholder images and default descriptions
    - Tiles are created in the correct display order (1-6)
    
  2. Security
    - Function runs with security definer to bypass RLS
    - Only creates tiles if none exist for the club
*/

-- Function to create default tiles for a club
CREATE OR REPLACE FUNCTION create_default_homepage_tiles(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create default tiles if the club has no tiles yet
  IF NOT EXISTS (
    SELECT 1 FROM homepage_tiles WHERE club_id = p_club_id
  ) THEN
    -- Insert 6 default tiles
    INSERT INTO homepage_tiles (club_id, title, description, image_url, link_url, display_order, is_active)
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

-- Create default tiles for all existing clubs that don't have any
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN 
    SELECT id FROM clubs 
    WHERE NOT EXISTS (
      SELECT 1 FROM homepage_tiles WHERE club_id = clubs.id
    )
  LOOP
    PERFORM create_default_homepage_tiles(club_record.id);
  END LOOP;
END;
$$;

-- Create a trigger to automatically add default tiles when a new club is created
CREATE OR REPLACE FUNCTION trigger_create_default_homepage_tiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default tiles for the new club
  PERFORM create_default_homepage_tiles(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_club_created_add_default_tiles ON clubs;
CREATE TRIGGER on_club_created_add_default_tiles
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_homepage_tiles();
