/*
  # Fix user_highest_role View Security

  1. Security Issue
    - The user_highest_role view was created with SECURITY DEFINER by default
    - This bypasses RLS and allows any user to query any other user's roles
    - This is a security risk as it exposes admin/role information

  2. Changes
    - Drop the existing view
    - Recreate it with SECURITY INVOKER (uses querying user's permissions)
    - Add RLS policy to protect role information
    - Users can only see their own role information
    - The helper functions (is_state_admin, is_national_admin, is_super_admin) 
      still use SECURITY DEFINER but only check the calling user's own permissions

  3. Security
    - View now respects RLS policies
    - Users can only query their own role information
    - Helper functions remain secure as they only check auth.uid()
*/

-- Drop existing view
DROP VIEW IF EXISTS user_highest_role;

-- Recreate view without SECURITY DEFINER
CREATE VIEW user_highest_role 
WITH (security_invoker = true)
AS
SELECT 
  user_id,
  CASE 
    WHEN EXISTS (SELECT 1 FROM profiles WHERE profiles.id = uc.user_id AND is_super_admin = true) 
      THEN 'super_admin'
    WHEN 'national_admin'::club_role = ANY(array_agg(role)) 
      THEN 'national_admin'
    WHEN 'state_admin'::club_role = ANY(array_agg(role)) 
      THEN 'state_admin'
    WHEN 'admin'::club_role = ANY(array_agg(role)) 
      THEN 'admin'
    WHEN 'editor'::club_role = ANY(array_agg(role)) 
      THEN 'editor'
    ELSE 'member'
  END as highest_role,
  array_agg(DISTINCT role) as all_roles,
  array_agg(DISTINCT club_id) as club_ids
FROM user_clubs uc
GROUP BY user_id;

-- Add RLS to protect the view
-- Users can only see their own role information
CREATE POLICY "Users can view own role information"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Grant access to authenticated users
GRANT SELECT ON user_highest_role TO authenticated;

-- Add comment explaining the security model
COMMENT ON VIEW user_highest_role IS 'View showing user highest role. Uses SECURITY INVOKER to respect RLS policies. Users can only query their own roles.';
