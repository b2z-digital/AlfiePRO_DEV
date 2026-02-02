/*
  # Fix association admin role checks

  1. Changes
    - Update is_state_admin_for_association to check for 'state_admin' role (not 'admin')
    - Update is_national_admin_for_association to check for 'national_admin' role (not 'admin')
    - These functions are used by RLS policies for budget categories and transactions
*/

-- Fix state admin check function
CREATE OR REPLACE FUNCTION is_state_admin_for_association(p_association_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_state_associations usa
    WHERE usa.state_association_id = p_association_id
    AND usa.user_id = auth.uid()
    AND usa.role = 'state_admin'
  );
$$;

-- Fix national admin check function
CREATE OR REPLACE FUNCTION is_national_admin_for_association(p_association_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_national_associations una
    WHERE una.national_association_id = p_association_id
    AND una.user_id = auth.uid()
    AND una.role = 'national_admin'
  );
$$;