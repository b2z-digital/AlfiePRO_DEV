/*
  # Create user_has_association_access Function

  1. Changes
    - Create helper function to check if user has ANY access to an association
*/

-- Create the function if it doesn't exist
CREATE OR REPLACE FUNCTION public.user_has_association_access(assoc_id uuid, assoc_type text)
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
    );
  ELSIF assoc_type = 'national' THEN
    RETURN EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = assoc_id
      AND user_id = auth.uid()
    );
  END IF;
  
  RETURN false;
END;
$function$;
