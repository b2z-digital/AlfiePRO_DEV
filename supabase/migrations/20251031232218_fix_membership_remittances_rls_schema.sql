/*
  # Fix Membership Remittances RLS Policy Schema Reference
  
  The RLS policy was failing because it referenced user_clubs without proper schema qualification.
  This migration fixes the policy to use the correct schema path.
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Club admins manage club remittances" ON membership_remittances;

-- Recreate with proper schema reference
CREATE POLICY "Club admins manage club remittances"
  ON membership_remittances
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = membership_remittances.club_id
        AND uc.user_id = auth.uid()
        AND uc.role = 'admin'
    )
  );
