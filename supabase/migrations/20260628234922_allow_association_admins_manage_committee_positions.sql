/*
  # Allow association admins to manage committee positions for clubs

  ## Problem
  State/national association admins (e.g., NSWRYA admin) cannot update committee
  member assignments (e.g., AGM updates) for clubs under their association.
  The existing RLS policies on committee_positions only check user_clubs, so
  association admins who don't have a direct club role get permission denied.

  ## Changes
  - Drop existing INSERT/UPDATE/DELETE policies on committee_positions
  - Recreate them with additional check for user_is_association_admin_for_club()
  - Follows the same pattern used for committee_position_definitions

  ## Security
  - user_is_association_admin_for_club() is a SECURITY DEFINER function that checks
    state_association and national_association membership
  - Only verified association admins gain access
*/

-- Drop existing write policies
DROP POLICY IF EXISTS "Admins can insert committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Admins can update committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Admins can delete committee positions" ON committee_positions;
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON committee_positions;

-- INSERT: club admin/editor OR association admin OR super admin
CREATE POLICY "Admins can insert committee positions"
  ON committee_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR user_is_association_admin_for_club(club_id, (SELECT auth.uid()))
    OR is_super_admin((SELECT auth.uid()))
  );

-- UPDATE: club admin/editor OR association admin OR super admin
CREATE POLICY "Admins can update committee positions"
  ON committee_positions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR user_is_association_admin_for_club(club_id, (SELECT auth.uid()))
    OR is_super_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR user_is_association_admin_for_club(club_id, (SELECT auth.uid()))
    OR is_super_admin((SELECT auth.uid()))
  );

-- DELETE: club admin/editor OR association admin OR super admin
CREATE POLICY "Admins can delete committee positions"
  ON committee_positions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = committee_positions.club_id
        AND uc.user_id = (SELECT auth.uid())
        AND uc.role IN ('admin', 'editor')
    )
    OR user_is_association_admin_for_club(club_id, (SELECT auth.uid()))
    OR is_super_admin((SELECT auth.uid()))
  );
