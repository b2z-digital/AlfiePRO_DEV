/*
  # Update Committee Positions Structure

  1. Schema Updates
    - Add `member_id` column to link to members table
    - Add `user_id` column to link to auth.users
    - Rename `title` to `position_title` for clarity
    - Keep `name`, `email`, `phone` for legacy data but make them nullable
    
  2. Security
    - Add RLS policies for the updated table
*/

-- Add new columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE committee_positions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE committee_positions ADD COLUMN member_id UUID REFERENCES members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'position_title'
  ) THEN
    ALTER TABLE committee_positions ADD COLUMN position_title TEXT;
  END IF;
END $$;

-- Make legacy columns nullable
ALTER TABLE committee_positions ALTER COLUMN name DROP NOT NULL;
ALTER TABLE committee_positions ALTER COLUMN email DROP NOT NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_committee_positions_user_id ON committee_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_committee_positions_member_id ON committee_positions(member_id);

-- Enable RLS if not already enabled
ALTER TABLE committee_positions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Club members can view committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Admins/editors can insert committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Admins/editors can update committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Admins/editors can delete committee positions" ON committee_positions;

-- Create new policies
CREATE POLICY "Club members can view committee positions"
  ON committee_positions FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins/editors can insert committee positions"
  ON committee_positions FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can update committee positions"
  ON committee_positions FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can delete committee positions"
  ON committee_positions FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );