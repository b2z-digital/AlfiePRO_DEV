/*
  # Move handicap tracking from member to boat level

  1. Changes
    - Remove `current_handicap` column from `members` table
    - Handicap is already stored at the boat level in `member_boats.handicap`
    - This allows skippers to have different handicaps for different boat classes

  2. Rationale
    - A skipper may race in multiple boat classes (e.g., IOM, 10R, DF95)
    - Each boat should have its own handicap specific to that class
    - The existing `member_boats.handicap` field is the correct place for this data
*/

DO $$
BEGIN
  -- Remove current_handicap column from members if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'current_handicap'
  ) THEN
    ALTER TABLE members DROP COLUMN current_handicap;
  END IF;
END $$;

-- Remove the index we created earlier
DROP INDEX IF EXISTS idx_members_current_handicap;