/*
  # Add Avatar URL to Profiles

  1. Schema Updates
    - Add `avatar_url` column to profiles table if it doesn't exist
*/

-- Add avatar_url to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;