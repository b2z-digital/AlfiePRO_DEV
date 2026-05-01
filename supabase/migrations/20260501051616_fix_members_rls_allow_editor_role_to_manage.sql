/*
  # Fix members RLS policies to allow editor role

  1. Problem
    - The FOR ALL policies on the `members` table only allow users with role = 'admin'
    - Users with role = 'editor' (like Martin Brady at RSYS) can access the member edit UI
      but the database rejects their UPDATE operations
    - This causes a silent save failure when editors try to edit member details

  2. Fix
    - Drop and recreate the two FOR ALL policies to include both 'admin' and 'editor' roles
    - "Admins or Super Admins can manage members" -> now includes editors
    - "Club admins can manage members" -> now includes editors

  3. Impact
    - Editors can now save changes to member records in their club
    - Matches the frontend behavior which already shows the edit UI to editors
*/

-- Drop the existing FOR ALL policies
DROP POLICY IF EXISTS "Admins or Super Admins can manage members" ON public.members;
DROP POLICY IF EXISTS "Club admins can manage members" ON public.members;

-- Recreate with editor role included
CREATE POLICY "Admins or Super Admins can manage members"
  ON public.members
  FOR ALL
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = members.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin'::club_role, 'editor'::club_role)
    ))
    OR is_platform_super_admin()
  );

CREATE POLICY "Club admins can manage members"
  ON public.members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = members.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin'::club_role, 'editor'::club_role)
    )
  );
