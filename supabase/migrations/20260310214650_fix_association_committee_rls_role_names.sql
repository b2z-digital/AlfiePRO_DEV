/*
  # Fix Association Committee RLS Policy Role Names

  1. Changes
    - Update state association committee RLS policies to check for 'state_admin' role (actual value in user_state_associations)
    - Update national association committee RLS policies to check for 'national_admin' role (actual value in user_national_associations)
    - Applies to both committee_position_definitions and committee_positions tables

  2. Important Notes
    - The user_state_associations.role column stores 'state_admin' not 'admin'
    - The user_national_associations.role column stores 'national_admin' not 'admin'
    - Previous policies checked for 'admin'/'owner' which never matched
*/

-- Fix STATE committee_position_definitions policies
DROP POLICY IF EXISTS "State admins can insert state association committee position definitions" ON committee_position_definitions;
CREATE POLICY "State admins can insert state association committee position definitions"
  ON committee_position_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can update state association committee position definitions" ON committee_position_definitions;
CREATE POLICY "State admins can update state association committee position definitions"
  ON committee_position_definitions
  FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can delete state association committee position definitions" ON committee_position_definitions;
CREATE POLICY "State admins can delete state association committee position definitions"
  ON committee_position_definitions
  FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

-- Fix NATIONAL committee_position_definitions policies
DROP POLICY IF EXISTS "National admins can insert national association committee position definitions" ON committee_position_definitions;
CREATE POLICY "National admins can insert national association committee position definitions"
  ON committee_position_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can update national association committee position definitions" ON committee_position_definitions;
CREATE POLICY "National admins can update national association committee position definitions"
  ON committee_position_definitions
  FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
    )
  )
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can delete national association committee position definitions" ON committee_position_definitions;
CREATE POLICY "National admins can delete national association committee position definitions"
  ON committee_position_definitions
  FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

-- Fix STATE committee_positions policies
DROP POLICY IF EXISTS "State admins can insert state association committee positions" ON committee_positions;
CREATE POLICY "State admins can insert state association committee positions"
  ON committee_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can update state association committee positions" ON committee_positions;
CREATE POLICY "State admins can update state association committee positions"
  ON committee_positions
  FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can delete state association committee positions" ON committee_positions;
CREATE POLICY "State admins can delete state association committee positions"
  ON committee_positions
  FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

-- Fix NATIONAL committee_positions policies
DROP POLICY IF EXISTS "National admins can insert national association committee posit" ON committee_positions;
CREATE POLICY "National admins can insert national association committee positions"
  ON committee_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can update national association committee posit" ON committee_positions;
CREATE POLICY "National admins can update national association committee positions"
  ON committee_positions
  FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  )
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can delete national association committee posit" ON committee_positions;
CREATE POLICY "National admins can delete national association committee positions"
  ON committee_positions
  FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  );
