/*
  # Fix user_clubs RLS to Allow Auto-Linking During Signup

  The auto_link_user_to_members() trigger fails because it tries to INSERT into
  user_clubs but there's no RLS policy allowing this during signup.

  Current policies:
  - SELECT: Users can view their own memberships
  - ALL: Club admins can manage memberships
  
  Missing:
  - INSERT policy for system/trigger to create memberships during signup

  ## Changes
  Add INSERT policy that allows:
  1. Service role to insert (for triggers)
  2. System to insert when auth.uid() is NULL (during signup trigger)
  3. Users to insert their own memberships (for self-service joining)
*/

-- Add policy to allow user_clubs creation during signup and by system
CREATE POLICY "Allow user_clubs creation during signup and by system"
  ON user_clubs
  FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (
    -- Allow if creating for yourself
    user_id = auth.uid()
    -- OR if no current user (system/trigger creating during signup)
    OR auth.uid() IS NULL
    -- OR if you're an admin of the club
    OR EXISTS (
      SELECT 1 
      FROM user_clubs uc 
      WHERE uc.club_id = user_clubs.club_id 
        AND uc.user_id = auth.uid() 
        AND uc.role = 'admin'
    )
  );

-- Also add explicit policy for service role to do everything
CREATE POLICY "Service role can manage all user_clubs"
  ON user_clubs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Allow user_clubs creation during signup and by system" ON user_clubs IS
'Allows user_clubs to be created during signup triggers, by the user themselves, or by club admins.';

COMMENT ON POLICY "Service role can manage all user_clubs" ON user_clubs IS
'Allows service role to perform any operation on user_clubs for system functions and triggers.';
