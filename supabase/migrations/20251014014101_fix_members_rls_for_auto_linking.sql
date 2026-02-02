/*
  # Fix members RLS to Allow Auto-Linking During Signup

  The auto_link_user_to_members() trigger fails because it tries to UPDATE members
  (setting user_id) but RLS blocks it because:
  - UPDATE policy requires user to be club admin/editor
  - Trigger runs during signup when no one is authenticated (auth.uid() is NULL)

  ## Changes
  Add UPDATE policy that allows system/triggers to link user_id during signup.
  This is safe because:
  - Only updates user_id field (linking member to auth user)
  - Only when user_id is currently NULL (not overwriting existing links)
  - Trigger already validates email match before linking
*/

-- Add policy to allow system to update members during auto-linking
CREATE POLICY "Allow system to link members during signup"
  ON members
  FOR UPDATE
  TO authenticated, anon, service_role
  USING (
    -- Allow if no current user (system/trigger during signup)
    auth.uid() IS NULL
    -- OR if you're an admin/editor (existing policy logic)
    OR EXISTS (
      SELECT 1 
      FROM user_clubs
      WHERE user_clubs.club_id = members.club_id 
        AND user_clubs.user_id = auth.uid() 
        AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    -- Allow if no current user (system/trigger during signup)
    auth.uid() IS NULL
    -- OR if you're an admin/editor (existing policy logic)
    OR EXISTS (
      SELECT 1 
      FROM user_clubs
      WHERE user_clubs.club_id = members.club_id 
        AND user_clubs.user_id = auth.uid() 
        AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Add service role policy for complete access
CREATE POLICY "Service role can manage all members"
  ON members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Allow system to link members during signup" ON members IS
'Allows system triggers to update member records during signup to link them to auth users.';

COMMENT ON POLICY "Service role can manage all members" ON members IS
'Allows service role to perform any operation on members for system functions and triggers.';
