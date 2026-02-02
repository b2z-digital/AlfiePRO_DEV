/*
  # Update Default Homepage Images to Use LMRYC Images
  
  This migration updates the default homepage tiles and carousel slides to use
  professional sailing-related images from LMRYC instead of generic Unsplash placeholders.
  
  1. Changes
    - Updates create_default_homepage_tiles function to use LMRYC images
    - Creates create_default_homepage_slides function with LMRYC images
    - Adds trigger to auto-create default slides for new clubs
    - Updates existing clubs without slides to have default slides
    
  2. Default Images
    - Membership: Racing yacht with colorful spinnaker
    - Race Program: Competitive fleet racing scene
    - Classes: Multiple yacht classes on water
    - Venue: Scenic waterside venue
    - News: News/media related image
    - Classifieds: Boats and equipment display
*/

-- Update the create_default_homepage_tiles function with LMRYC images
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
    -- Insert 6 default tiles with LMRYC images
    INSERT INTO homepage_tiles (club_id, title, description, image_url, link_url, display_order, is_active)
    VALUES
      (p_club_id, 'Membership', 'Join our club and become part of our sailing community', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png', '#membership', 1, true),
      (p_club_id, 'Race Program', 'View our racing schedule and upcoming events', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png', '#races', 2, true),
      (p_club_id, 'Classes', 'Explore the yacht classes competing at our club', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png', '#classes', 3, true),
      (p_club_id, 'Venue', 'Learn about our facilities and location', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714334371_dgngg6.jpg', '#venue', 4, true),
      (p_club_id, 'News', 'Stay up to date with club news and announcements', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761799093766_43j26l.jpg', '#news', 5, true),
      (p_club_id, 'Classifieds', 'Browse boats and equipment for sale', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714523155_j2g5fj.jpg', '#classifieds', 6, true);
  END IF;
END;
$$;

-- Create function to add default homepage carousel slides
CREATE OR REPLACE FUNCTION create_default_homepage_slides(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create default slides if the club has no slides yet
  IF NOT EXISTS (
    SELECT 1 FROM homepage_slides WHERE club_id = p_club_id
  ) THEN
    -- Insert 3 default carousel slides with LMRYC images
    INSERT INTO homepage_slides (club_id, title, subtitle, image_url, button_text, button_url, display_order, is_active)
    VALUES
      (p_club_id, 'Welcome to Our Club', 'Join us for exciting radio yacht racing', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png', 'Learn More', '#membership', 0, true),
      (p_club_id, 'Racing Calendar', 'View our upcoming races and events', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png', 'See Schedule', '#races', 1, true),
      (p_club_id, 'Yacht Classes', 'Discover the classes we race', 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png', 'View Classes', '#classes', 2, true);
  END IF;
END;
$$;

-- Create trigger function for slides
CREATE OR REPLACE FUNCTION trigger_create_default_homepage_slides()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default slides for the new club
  PERFORM create_default_homepage_slides(NEW.id);
  RETURN NEW;
END;
$$;

-- Add trigger to create default slides when club is created
DROP TRIGGER IF EXISTS on_club_created_add_default_slides ON clubs;
CREATE TRIGGER on_club_created_add_default_slides
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_homepage_slides();

-- Create default slides for all existing clubs that don't have any
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN 
    SELECT id FROM clubs 
    WHERE NOT EXISTS (
      SELECT 1 FROM homepage_slides WHERE club_id = clubs.id
    )
  LOOP
    PERFORM create_default_homepage_slides(club_record.id);
  END LOOP;
END;
$$;
