/*
  # Fix Dashboard Layouts Unique Constraint

  1. Changes
    - Add unique constraint on (user_id, club_id, is_default)
    - This allows upsert to work correctly
    
  2. Notes
    - We include is_default in the constraint to allow multiple layouts per user/club in the future
    - For now, all layouts have is_default=true
*/

-- Drop existing indexes
DROP INDEX IF EXISTS idx_user_dashboard_layouts_user_club;

-- Add unique constraint
DO $$
BEGIN
  -- First, ensure no duplicates exist
  DELETE FROM user_dashboard_layouts a
  USING user_dashboard_layouts b
  WHERE a.id > b.id
    AND a.user_id = b.user_id
    AND (a.club_id = b.club_id OR (a.club_id IS NULL AND b.club_id IS NULL))
    AND a.is_default = b.is_default;

  -- Add unique constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_dashboard_layouts_user_club_default_key'
  ) THEN
    ALTER TABLE user_dashboard_layouts
    ADD CONSTRAINT user_dashboard_layouts_user_club_default_key
    UNIQUE (user_id, club_id, is_default);
  END IF;
END $$;

-- Recreate index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_user_club ON user_dashboard_layouts(user_id, club_id) WHERE is_default = true;