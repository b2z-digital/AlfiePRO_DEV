/*
  # Fix Membership Remittances RLS with Helper Function
  
  The RLS policy is failing due to schema path issues with user_clubs.
  This migration creates a helper function and updates the policy to use it.
*/

-- Create a helper function to check club admin status
CREATE OR REPLACE FUNCTION public.is_club_admin_for_remittance(remittance_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_clubs uc
    WHERE uc.club_id = remittance_club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
  );
END;
$$;

-- Drop existing policy
DROP POLICY IF EXISTS "Club admins manage club remittances" ON membership_remittances;

-- Recreate with helper function
CREATE POLICY "Club admins manage club remittances"
  ON membership_remittances
  FOR ALL
  TO authenticated
  USING (is_club_admin_for_remittance(club_id))
  WITH CHECK (is_club_admin_for_remittance(club_id));
