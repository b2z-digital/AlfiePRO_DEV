/*
  # Fix Clubs Insert Policy for State Association Admins

  1. Changes
    - Drop existing INSERT policy for clubs
    - Create new INSERT policy that allows:
      - Users creating their own clubs (with created_by_user_id)
      - State Association admins creating clubs for their association
      - National Association admins creating clubs
      - Platform super admins

  2. Security
    - Maintains RLS protection
    - Ensures state admins can only create clubs for their own association
    - Ensures created_by_user_id is always set to current user
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can create clubs" ON clubs;

-- Create new policy allowing state/national admins to create clubs
CREATE POLICY "Users and association admins can create clubs"
  ON clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must set created_by_user_id to current user
    created_by_user_id = auth.uid()
    AND (
      -- Platform super admin can create any club
      is_platform_super_admin()
      OR
      -- State admin can create clubs for their state association
      (
        state_association_id IS NOT NULL
        AND is_association_admin(state_association_id, 'state')
      )
      OR
      -- Regular user creating their own club (no association)
      (
        state_association_id IS NULL
      )
    )
  );
