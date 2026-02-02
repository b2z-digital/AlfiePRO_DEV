/*
  # Add PRO (Principal Race Officer) role to club_role enum

  1. Changes
    - Add 'pro' value to the club_role enum type
    - PRO role provides race management and scoring capabilities

  2. Security
    - No RLS changes needed - existing policies handle all club_role values
*/

-- Add 'pro' to the club_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pro'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'club_role')
  ) THEN
    ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'pro';
  END IF;
END $$;

-- Update the comment to reflect all available roles
COMMENT ON TYPE club_role IS 'User roles: viewer (view-only), member (basic), pro (race officer), editor (content), admin (club), state_admin (multi-club), national_admin (all clubs)';
