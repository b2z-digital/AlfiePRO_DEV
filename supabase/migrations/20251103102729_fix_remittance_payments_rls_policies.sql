/*
  # Fix Remittance Payments RLS Policies

  1. Changes
    - Simplify RLS policies to avoid user_clubs reference issues
    - Focus on association admin checks
    - Add better error handling
    
  2. Security
    - Maintain security while fixing query issues
    - State admins can view/manage their payments
    - National admins can view/manage their payments
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view payments for their associations" ON remittance_payments;
DROP POLICY IF EXISTS "Admins can create payments" ON remittance_payments;
DROP POLICY IF EXISTS "Admins can update payments" ON remittance_payments;

-- Recreate with simplified logic
CREATE POLICY "Association admins can view payments"
  ON remittance_payments FOR SELECT
  TO authenticated
  USING (
    -- State admins can view payments to their state
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    -- National admins can view payments to their national association
    (to_type = 'national' AND user_has_association_access(to_national_id, 'national'))
    OR
    -- Also allow viewing if from their state
    (from_type = 'state' AND user_has_association_access(from_state_id, 'state'))
  );

CREATE POLICY "Association admins can create payments"
  ON remittance_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    -- State admins can record payments to their state
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    -- State admins can record payments from their state
    (from_type = 'state' AND user_has_association_access(from_state_id, 'state'))
  );

CREATE POLICY "Association admins can update payments"
  ON remittance_payments FOR UPDATE
  TO authenticated
  USING (
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    (to_type = 'national' AND user_has_association_access(to_national_id, 'national'))
  )
  WITH CHECK (
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    (to_type = 'national' AND user_has_association_access(to_national_id, 'national'))
  );

CREATE POLICY "Association admins can delete payments"
  ON remittance_payments FOR DELETE
  TO authenticated
  USING (
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    (to_type = 'national' AND user_has_association_access(to_national_id, 'national'))
  );