/*
  # Add current_handicap to members table

  1. Changes
    - Add `current_handicap` column to `members` table to track the member's latest handicap
    - This field stores the last handicap allocated to a skipper in their most recent handicap race
    - Will be used to pre-populate the handicap column when creating new races
    - Defaults to 0 (unrated skipper)

  2. Usage
    - When a handicap race is completed, the system updates each participant's `current_handicap`
    - When creating a new race, skippers' handicaps are loaded from this field
    - Race officers can clear handicaps to 0 before scoring if running a seeded race
    - Admins, editors, and superadmins can manually edit member handicaps
    - Members can view but not edit their handicap
*/

DO $$
BEGIN
  -- Add current_handicap column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'current_handicap'
  ) THEN
    ALTER TABLE members ADD COLUMN current_handicap INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add index for faster queries when loading handicaps for race creation
CREATE INDEX IF NOT EXISTS idx_members_current_handicap ON members(current_handicap);

-- Add helpful comment
COMMENT ON COLUMN members.current_handicap IS 'The member''s current handicap from their most recent handicap race. Used to pre-populate handicaps for new races.';