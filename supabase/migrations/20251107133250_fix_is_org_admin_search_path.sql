/*
  # Fix is_org_admin function search path

  1. Changes
    - Update is_org_admin function to use proper search_path
    - This fixes the "relation 'user_clubs' does not exist" error when creating public events
  
  2. Notes
    - The function was using SET search_path TO '' which prevented it from finding tables
    - Changed to SET search_path TO 'public' to match other security definer functions
*/

CREATE OR REPLACE FUNCTION public.is_org_admin(org_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_clubs uc
    WHERE uc.club_id = org_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('national_admin', 'state_admin', 'admin')
  );
END;
$$;