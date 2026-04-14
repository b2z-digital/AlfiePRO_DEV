/*
  # Fix committee_position_definitions SELECT RLS for association admins

  ## Problem
  Association admins (state/national) who manage clubs from the association dashboard
  do NOT have entries in user_clubs for those clubs. The existing SELECT policy only
  checks user_clubs, so association admins cannot see committee positions for clubs
  under their association.

  ## Changes
  - UPDATE the "Club members can view position definitions" SELECT policy to also
    allow user_is_association_admin_for_club() and is_super_admin()
  
  ## Security
  - user_is_association_admin_for_club() is SECURITY DEFINER — safe in RLS
  - is_super_admin() is SECURITY DEFINER — safe in RLS
*/

DROP POLICY IF EXISTS "Club members can view position definitions" ON committee_position_definitions;

CREATE POLICY "Club members can view position definitions"
  ON committee_position_definitions
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
    )
    OR user_is_association_admin_for_club(club_id, auth.uid())
    OR is_super_admin(auth.uid())
  );
