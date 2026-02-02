/*
  # Add State and National Admin Roles

  1. Updates
    - Extend club_role enum to include 'state_admin' and 'national_admin'
    - These roles provide multi-club oversight capabilities
    - Club admins manage a single club
    - State admins manage multiple clubs in a state/region
    - National admins manage all clubs nationwide

  2. Role Hierarchy
    - 'member' - Basic club member (read-only)
    - 'editor' - Can edit content within a club
    - 'admin' - Full club administration
    - 'state_admin' - Manages multiple clubs in a state/region
    - 'national_admin' - Manages all clubs nationwide
    - 'super_admin' - Platform owner (managed separately via user flags)

  3. Security
    - Maintains existing RLS policies
    - New policies will be added for state/national admin access in future migrations
*/

-- Drop existing enum and recreate with new values
-- We need to do this carefully to preserve existing data
DO $$
BEGIN
  -- Check if we need to update the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'state_admin'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'club_role')
  ) THEN
    -- Add new enum values
    ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'member';
    ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'state_admin';
    ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'national_admin';
  END IF;
END $$;

-- Add subscription_tier to clubs to track their plan level
ALTER TABLE clubs 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT CHECK (subscription_tier IN ('club', 'state', 'national'));

-- Add is_super_admin flag to profiles for platform owners
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_user_clubs_role 
ON user_clubs(role);

-- Create index for super admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin 
ON profiles(is_super_admin) 
WHERE is_super_admin = true;

-- Create a view to easily check user's highest role
CREATE OR REPLACE VIEW user_highest_role AS
SELECT 
  user_id,
  CASE 
    WHEN EXISTS (SELECT 1 FROM profiles WHERE profiles.id = uc.user_id AND is_super_admin = true) 
      THEN 'super_admin'
    WHEN 'national_admin' = ANY(array_agg(role)) 
      THEN 'national_admin'
    WHEN 'state_admin' = ANY(array_agg(role)) 
      THEN 'state_admin'
    WHEN 'admin' = ANY(array_agg(role)) 
      THEN 'admin'
    WHEN 'editor' = ANY(array_agg(role)) 
      THEN 'editor'
    ELSE 'member'
  END as highest_role,
  array_agg(DISTINCT role) as all_roles,
  array_agg(DISTINCT club_id) as club_ids
FROM user_clubs uc
GROUP BY user_id;

-- Add helper function to check if user is state admin
CREATE OR REPLACE FUNCTION is_state_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = check_user_id
    AND role IN ('state_admin', 'national_admin')
  ) OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id
    AND is_super_admin = true
  );
$$;

-- Add helper function to check if user is national admin
CREATE OR REPLACE FUNCTION is_national_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = check_user_id
    AND role = 'national_admin'
  ) OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id
    AND is_super_admin = true
  );
$$;

-- Add helper function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id
    AND is_super_admin = true
  );
$$;

-- Add comment explaining the role hierarchy
COMMENT ON TYPE club_role IS 'User roles: member (read-only), editor (content), admin (club), state_admin (multi-club), national_admin (all clubs)';
