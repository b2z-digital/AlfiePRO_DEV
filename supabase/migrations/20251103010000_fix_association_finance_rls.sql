/*
  # Fix Association Finance RLS Policies

  1. Changes
    - Drop existing restrictive policies on association_budget_categories and association_transactions
    - Create new simplified policies that check:
      a) User is a state_admin for state associations
      b) User is a national_admin for national associations
      c) User has ANY role in the association (for initial testing)
    - Add helper function to debug association access
*/

-- Drop existing policies for association_budget_categories
DROP POLICY IF EXISTS "State admins can view their association categories" ON association_budget_categories;
DROP POLICY IF EXISTS "National admins can view their association categories" ON association_budget_categories;
DROP POLICY IF EXISTS "State admins can manage their association categories" ON association_budget_categories;
DROP POLICY IF EXISTS "National admins can manage their association categories" ON association_budget_categories;

-- Drop existing policies for association_transactions
DROP POLICY IF EXISTS "State admins can view their association transactions" ON association_transactions;
DROP POLICY IF EXISTS "National admins can view their association transactions" ON association_transactions;
DROP POLICY IF EXISTS "State admins can manage their association transactions" ON association_transactions;
DROP POLICY IF EXISTS "National admins can manage their association transactions" ON association_transactions;

-- Helper function to check if user has ANY association access (for debugging)
CREATE OR REPLACE FUNCTION user_has_association_access(p_association_id uuid, p_association_type text)
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
    AND p_association_type = 'state'
  ) OR EXISTS (
    SELECT 1 FROM user_national_associations una
    WHERE una.national_association_id = p_association_id
    AND una.user_id = auth.uid()
    AND p_association_type = 'national'
  );
$$;

-- Helper function to check if user is admin for any association type
CREATE OR REPLACE FUNCTION is_association_admin(p_association_id uuid, p_association_type text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p_association_type = 'state' THEN
        EXISTS (
          SELECT 1 FROM user_state_associations usa
          WHERE usa.state_association_id = p_association_id
          AND usa.user_id = auth.uid()
          AND usa.role IN ('state_admin', 'admin')
        )
      WHEN p_association_type = 'national' THEN
        EXISTS (
          SELECT 1 FROM user_national_associations una
          WHERE una.national_association_id = p_association_id
          AND una.user_id = auth.uid()
          AND una.role IN ('national_admin', 'admin')
        )
      ELSE false
    END;
$$;

-- New simplified policies for association_budget_categories
CREATE POLICY "Users can view association categories if they have access"
  ON association_budget_categories FOR SELECT
  TO authenticated
  USING (user_has_association_access(association_id, association_type));

CREATE POLICY "Admins can insert association categories"
  ON association_budget_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association categories"
  ON association_budget_categories FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association categories"
  ON association_budget_categories FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- New simplified policies for association_transactions
CREATE POLICY "Users can view association transactions if they have access"
  ON association_transactions FOR SELECT
  TO authenticated
  USING (user_has_association_access(association_id, association_type));

CREATE POLICY "Admins can insert association transactions"
  ON association_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association transactions"
  ON association_transactions FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association transactions"
  ON association_transactions FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));
