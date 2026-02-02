/*
  # Fix boat classes RLS policies for national_admin and state_admin roles
  
  1. Changes
    - Update INSERT policies to accept both 'admin' and 'national_admin'/'state_admin' roles
    - Update UPDATE policies to accept both 'admin' and 'national_admin'/'state_admin' roles
    - Update DELETE policies to accept both 'admin' and 'national_admin'/'state_admin' roles
    
  2. Reason
    - Users with 'national_admin' or 'state_admin' roles should be able to manage boat classes
    - Previous policies only checked for 'admin' role
*/

-- Drop existing policies
DROP POLICY IF EXISTS "National admins can create national boat classes" ON boat_classes;
DROP POLICY IF EXISTS "State admins can create state boat classes" ON boat_classes;
DROP POLICY IF EXISTS "Association admins can update their boat classes" ON boat_classes;
DROP POLICY IF EXISTS "Association admins can delete their boat classes" ON boat_classes;

-- Recreate INSERT policy for national admins
CREATE POLICY "National admins can create national boat classes"
  ON boat_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'national' 
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = boat_classes.created_by_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'national_admin')
    )
  );

-- Recreate INSERT policy for state admins
CREATE POLICY "State admins can create state boat classes"
  ON boat_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'state' 
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = boat_classes.created_by_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'state_admin')
    )
  );

-- Recreate UPDATE policy
CREATE POLICY "Association admins can update their boat classes"
  ON boat_classes
  FOR UPDATE
  TO authenticated
  USING (
    (created_by_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = boat_classes.created_by_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'national_admin')
    ))
    OR
    (created_by_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = boat_classes.created_by_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'state_admin')
    ))
  )
  WITH CHECK (
    (created_by_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = boat_classes.created_by_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'national_admin')
    ))
    OR
    (created_by_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = boat_classes.created_by_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'state_admin')
    ))
  );

-- Recreate DELETE policy
CREATE POLICY "Association admins can delete their boat classes"
  ON boat_classes
  FOR DELETE
  TO authenticated
  USING (
    (created_by_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = boat_classes.created_by_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'national_admin')
    ))
    OR
    (created_by_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = boat_classes.created_by_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'state_admin')
    ))
  );
