/*
  # Fix check_integration_access function

  The function referenced non-existent tables `state_association_admins` and
  `national_association_admins`. The correct tables are `user_state_associations`
  and `user_national_associations`.

  This fix updates the SELECT access function so that association admins can
  properly read their own integrations records.
*/

CREATE OR REPLACE FUNCTION public.check_integration_access(integration_row integrations)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check club access
  IF integration_row.club_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_clubs
      WHERE club_id = integration_row.club_id
      AND user_id = auth.uid()
    );
  END IF;

  -- Check state association access
  IF integration_row.state_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = integration_row.state_association_id
      AND user_id = auth.uid()
    );
  END IF;

  -- Check national association access
  IF integration_row.national_association_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = integration_row.national_association_id
      AND user_id = auth.uid()
    );
  END IF;

  RETURN false;
END;
$$;
