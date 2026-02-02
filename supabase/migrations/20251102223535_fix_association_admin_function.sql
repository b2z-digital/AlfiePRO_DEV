/*
  # Fix is_association_admin Function

  1. Changes
    - Update is_association_admin to also check for generic 'admin' role
    - Keeps existing parameter names (assoc_id, assoc_type)
*/

-- Update the function to check for both specific admin roles AND generic 'admin' role
CREATE OR REPLACE FUNCTION public.is_association_admin(assoc_id uuid, assoc_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF assoc_type = 'state' THEN
    RETURN EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = assoc_id
      AND user_id = auth.uid()
      AND role IN ('state_admin', 'admin')
    );
  ELSIF assoc_type = 'national' THEN
    RETURN EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = assoc_id
      AND user_id = auth.uid()
      AND role IN ('national_admin', 'admin')
    );
  END IF;
  
  RETURN false;
END;
$function$;
