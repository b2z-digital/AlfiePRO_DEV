/*
  # Allow association admins to view all users in their association

  1. Problem
    - State/national admins can only see their own row in user_*_associations
    - They need to see ALL users in their association to manage them
  
  2. Solution
    - Add SELECT policies using the SECURITY DEFINER helper functions
    - Admins can view all users in associations they administer
*/

-- State association admins can view all users in their association
CREATE POLICY "State admins can view all users in their association"
  ON user_state_associations
  FOR SELECT
  TO authenticated
  USING (
    public.is_state_association_admin(state_association_id, auth.uid())
  );

-- National association admins can view all users in their association
CREATE POLICY "National admins can view all users in their association"
  ON user_national_associations
  FOR SELECT
  TO authenticated
  USING (
    public.is_national_association_admin(national_association_id, auth.uid())
  );
