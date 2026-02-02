/*
  # Add Avatar URL to Members Table

  1. Changes
    - Add `avatar_url` column to `members` table
    - This allows club admins to upload avatars for members who haven't created accounts yet
    - When members sign up, this avatar will be copied to their profile

  2. Notes
    - Column is nullable since not all members will have avatars
    - Text type to store the URL to the avatar image in storage
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE members ADD COLUMN avatar_url text;
  END IF;
END $$;
