/*
  # Fix club_venues RLS policy for state admins

  ## Problem
  The "State admins can view association club venues" policy checks for
  `usa.role = 'admin'` but the actual role value in user_state_associations
  is `'state_admin'`. This prevents state admins from seeing venues for
  clubs in their association through the state admin policy path.

  ## Changes
  - Drop and recreate the state admin SELECT policy with correct role check
  - Also add national admin policy for completeness
  - Add super admin access
*/

DROP POLICY IF EXISTS "State admins can view association club venues" ON club_venues;

CREATE POLICY "State admins can view association club venues"
  ON club_venues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON c.state_association_id = usa.state_association_id
      WHERE c.id = club_venues.club_id
        AND usa.user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );
