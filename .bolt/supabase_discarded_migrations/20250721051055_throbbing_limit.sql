/*
  # Add default venue support

  1. Changes
    - Add `is_default` column to venues table
    - Add constraint to ensure only one default venue per club
    - Add index for better performance on default venue queries

  2. Security
    - No changes to RLS policies needed as existing policies cover the new column
*/

-- Add is_default column to venues table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE venues ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;

-- Add unique constraint to ensure only one default venue per club
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'venues_club_id_is_default_unique'
  ) THEN
    ALTER TABLE venues ADD CONSTRAINT venues_club_id_is_default_unique 
    UNIQUE (club_id, is_default) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Add index for better performance on default venue queries
CREATE INDEX IF NOT EXISTS idx_venues_club_id_is_default 
ON venues (club_id, is_default) 
WHERE is_default = true;