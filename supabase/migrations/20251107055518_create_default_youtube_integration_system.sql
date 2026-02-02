/*
  # Create Default YouTube Integration System
  
  1. Changes
    - Add is_default flag to club_integrations to mark shared integrations
    - Create function to copy default integrations to new clubs
    - Create trigger to automatically assign default integrations to new clubs
    - Backfill all existing clubs with the default YouTube integration
    
  2. Security
    - Maintain existing RLS policies
    - Only admins can manage default integrations
*/

-- Add is_default flag to club_integrations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_integrations' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE club_integrations ADD COLUMN is_default BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Mark the YouTube integration as default
UPDATE club_integrations 
SET is_default = true 
WHERE provider = 'youtube' 
AND club_id = 'bafdff76-ebe7-4890-b7fa-20aa9bb37491';

-- Create function to copy default integrations to a new club
CREATE OR REPLACE FUNCTION copy_default_integrations_to_club(target_club_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Copy all default integrations to the new club
  INSERT INTO club_integrations (
    club_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    is_default
  )
  SELECT 
    target_club_id,
    provider,
    page_id,
    page_name,
    access_token,
    refresh_token,
    token_expires_at,
    youtube_channel_id,
    youtube_channel_name,
    instagram_user_id,
    instagram_username,
    google_analytics_property_id,
    google_calendar_id,
    google_email,
    paypal_merchant_id,
    paypal_email,
    is_enabled,
    metadata,
    false -- Don't mark the copy as default, only the original is default
  FROM club_integrations
  WHERE is_default = true
  ON CONFLICT (club_id, provider) DO NOTHING;
END;
$$;

-- Create trigger function to auto-assign default integrations to new clubs
CREATE OR REPLACE FUNCTION auto_assign_default_integrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Copy default integrations to the newly created club
  PERFORM copy_default_integrations_to_club(NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger on clubs table to auto-assign integrations
DROP TRIGGER IF EXISTS trigger_auto_assign_default_integrations ON clubs;
CREATE TRIGGER trigger_auto_assign_default_integrations
AFTER INSERT ON clubs
FOR EACH ROW
EXECUTE FUNCTION auto_assign_default_integrations();

-- Backfill all existing clubs with default YouTube integration
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN SELECT id FROM clubs WHERE id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491' LOOP
    PERFORM copy_default_integrations_to_club(club_record.id);
  END LOOP;
END $$;
