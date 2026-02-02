/*
  # Bidirectional Avatar Sync Between Profiles and Members

  This migration creates a trigger to sync avatar updates from profiles to members table.
  This ensures that when a user updates their profile picture in settings, it propagates
  to the members table so it shows everywhere (member lists, communications, tasks, etc.)

  1. Changes
    - Create function to sync profile avatar updates to members table
    - Create trigger on profiles table to call the sync function
    - Backfill existing avatar_url values from profiles to members

  2. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only syncs when avatar_url changes
*/

-- Create function to sync profile avatar to members table
CREATE OR REPLACE FUNCTION sync_profile_avatar_to_members()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if avatar_url has changed
  IF (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url) THEN
    -- Update all member records for this user across all clubs
    UPDATE members
    SET
      avatar_url = NEW.avatar_url,
      updated_at = now()
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS sync_profile_avatar_to_members_trigger ON profiles;
CREATE TRIGGER sync_profile_avatar_to_members_trigger
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_avatar_to_members();

-- Backfill existing avatar_url values from profiles to members
-- This ensures any existing avatars are synced
UPDATE members m
SET avatar_url = p.avatar_url
FROM profiles p
WHERE m.user_id = p.id
  AND p.avatar_url IS NOT NULL
  AND (m.avatar_url IS NULL OR m.avatar_url != p.avatar_url);