/*
  # Add user_id to members table

  1. Changes
    - Add optional `user_id` column to `members` table to link members to auth users
    - Create index for performance
  
  2. Notes
    - This allows members to be linked to their auth.users account
    - Not all members need to have a user_id (some may not have accounts)
    - This enables features like auto-selecting attending members as skippers
*/

-- Add user_id column to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE members ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- Create unique constraint to ensure one member per user per club
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'members_club_user_unique'
  ) THEN
    ALTER TABLE members ADD CONSTRAINT members_club_user_unique UNIQUE (club_id, user_id);
  END IF;
END $$;