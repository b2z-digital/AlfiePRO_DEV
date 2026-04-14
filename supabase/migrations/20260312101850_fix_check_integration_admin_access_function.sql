/*
  # Fix check_integration_admin_access function

  The function referenced non-existent tables `state_association_admins` and
  `national_association_admins`. The correct tables are `user_state_associations`
  and `user_national_associations`.

  This fix updates the function to use the correct table and column names,
  allowing state and national association admins to manage (including delete)
  their integrations.
*/

CREATE OR REPLACE FUNCTION public.check_integration_admin_access(integration_row integrations)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check club admin access
  IF integration_row.club_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_clubs
      WHERE club_id = integration_row.club_id
      AND user_id = auth.uid()
      AND role = 'admin'
    );
  END IF;

  -- Check state association admin access
  IF integration_row.state_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = integration_row.state_association_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'state_admin')
    );
  END IF;

  -- Check national association admin access
  IF integration_row.national_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = integration_row.national_association_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'national_admin')
    );
  END IF;

  RETURN false;
END;
$$;
