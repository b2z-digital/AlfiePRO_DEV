/*
  # Add is_default column to venues table

  1. Changes
    - Add `is_default` column to venues table with default value false
    - Add constraint to ensure only one default venue per club
    - Create index for better performance on default venue queries

  2. Security
    - No changes to RLS policies needed
*/

-- Add is_default column to venues table
ALTER TABLE venues 
ADD COLUMN is_default boolean DEFAULT false;

-- Create a unique partial index to ensure only one default venue per club
CREATE UNIQUE INDEX venues_club_default_unique 
ON venues (club_id) 
WHERE is_default = true;

-- Add a comment to explain the constraint
COMMENT ON INDEX venues_club_default_unique IS 'Ensures only one default venue per club';