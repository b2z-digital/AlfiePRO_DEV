/*
  # Allow Association Admins to View All Their Clubs

  1. Changes
    - Update clubs SELECT policy to allow state association admins to see all clubs in their state
    - Allow national association admins to see all clubs (via state associations)
    - Keep existing permission for club members to see their own clubs

  2. Security
    - Maintains RLS enforcement
    - Uses user_state_associations and user_national_associations tables
    - Association admins can only see clubs under their jurisdiction
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view clubs they belong to" ON clubs;
DROP POLICY IF EXISTS "Users can view clubs they have access to" ON clubs;

-- Create a new comprehensive policy
CREATE POLICY "Users can view clubs they have access to"
  ON clubs FOR SELECT
  TO authenticated
  USING (
    -- Club members can see their clubs
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = clubs.id
      AND user_clubs.user_id = auth.uid()
    )
    OR
    -- State association admins can see all clubs in their state
    (
      clubs.state_association_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_state_associations
        WHERE user_state_associations.user_id = auth.uid()
        AND user_state_associations.state_association_id = clubs.state_association_id
      )
    )
    OR
    -- National association admins can see all clubs under their states
    (
      clubs.state_association_id IS NOT NULL
      AND EXISTS (
        SELECT 1 
        FROM user_national_associations una
        INNER JOIN state_associations sa ON sa.national_association_id = una.national_association_id
        WHERE una.user_id = auth.uid()
        AND sa.id = clubs.state_association_id
      )
    )
  );
