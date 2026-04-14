/*
  # Fix committee_position_definitions RLS for association admins

  ## Problem
  Association admins (state/national) who manage clubs from the association dashboard
  do NOT have entries in user_clubs for those clubs. The existing INSERT/UPDATE/DELETE
  policies only check user_clubs, so association admins get a permission denied error
  when trying to create or edit committee positions for clubs under their association.

  ## Changes
  - UPDATE INSERT policy: also allow user_is_association_admin_for_club() OR is_super_admin()
  - UPDATE UPDATE policy: same addition
  - UPDATE DELETE policy: same addition

  ## Security
  - user_is_association_admin_for_club() is a SECURITY DEFINER function that checks
    state_association and national_association membership — safe to use in RLS
*/

DROP POLICY IF EXISTS "Admins/editors can insert position definitions" ON committee_position_definitions;
DROP POLICY IF EXISTS "Admins/editors can update position definitions" ON committee_position_definitions;
DROP POLICY IF EXISTS "Admins/editors can delete position definitions" ON committee_position_definitions;

CREATE POLICY "Admins/editors can insert position definitions"
  ON committee_position_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
        AND uc.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role])
    )
    OR user_is_association_admin_for_club(club_id, auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Admins/editors can update position definitions"
  ON committee_position_definitions
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
        AND uc.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role])
    )
    OR user_is_association_admin_for_club(club_id, auth.uid())
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
        AND uc.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role])
    )
    OR user_is_association_admin_for_club(club_id, auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "Admins/editors can delete position definitions"
  ON committee_position_definitions
  FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
        AND uc.role = ANY (ARRAY['admin'::club_role, 'editor'::club_role])
    )
    OR user_is_association_admin_for_club(club_id, auth.uid())
    OR is_super_admin(auth.uid())
  );
