/*
  # Fix Membership Remittances Update Policy
  
  The UPDATE policy was missing WITH CHECK clause, causing failures when club admins
  try to update remittance status.
*/

-- Drop and recreate the club admin policy with WITH CHECK
DROP POLICY IF EXISTS "Club admins manage club remittances" ON membership_remittances;

CREATE POLICY "Club admins manage club remittances"
  ON membership_remittances
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    )
  );
