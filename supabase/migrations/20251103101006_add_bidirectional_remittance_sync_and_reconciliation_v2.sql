/*
  # Bidirectional Remittance Sync and Payment Reconciliation System

  1. New Tables
    - `remittance_payments` - Track bulk payments from clubs to associations
    - `remittance_payment_allocations` - Link payments to individual member remittances
    
  2. Changes
    - Add trigger to sync status changes from state back to club
    - Add reconciliation tracking fields
    
  3. Features
    - Clubs can mark members as paid → flows to state
    - State can mark members as paid → flows back to club AND creates expense
    - Payment reconciliation system for matching bulk payments to members
*/

-- Create remittance_payments table for tracking bulk payments
CREATE TABLE IF NOT EXISTS remittance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Payment identification
  payment_reference text NOT NULL,
  payment_date date NOT NULL,
  
  -- Payer information
  from_club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  from_state_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  from_type text NOT NULL CHECK (from_type IN ('club', 'state')),
  
  -- Payee information  
  to_state_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  to_national_id uuid REFERENCES national_associations(id) ON DELETE CASCADE,
  to_type text NOT NULL CHECK (to_type IN ('state', 'national')),
  
  -- Payment details
  total_amount numeric(10,2) NOT NULL,
  allocated_amount numeric(10,2) DEFAULT 0,
  unallocated_amount numeric(10,2) GENERATED ALWAYS AS (total_amount - allocated_amount) STORED,
  
  payment_method text,
  bank_transaction_id text,
  notes text,
  
  -- Reconciliation status
  reconciliation_status text DEFAULT 'pending' CHECK (reconciliation_status IN ('pending', 'partial', 'completed')),
  reconciled_at timestamptz,
  reconciled_by uuid REFERENCES auth.users(id),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create remittance_payment_allocations table
CREATE TABLE IF NOT EXISTS remittance_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  payment_id uuid NOT NULL REFERENCES remittance_payments(id) ON DELETE CASCADE,
  remittance_id uuid NOT NULL REFERENCES membership_remittances(id) ON DELETE CASCADE,
  
  allocated_amount numeric(10,2) NOT NULL,
  allocation_date timestamptz DEFAULT now(),
  allocated_by uuid REFERENCES auth.users(id),
  notes text,
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(payment_id, remittance_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_remittance_payments_from_club ON remittance_payments(from_club_id);
CREATE INDEX IF NOT EXISTS idx_remittance_payments_from_state ON remittance_payments(from_state_id);
CREATE INDEX IF NOT EXISTS idx_remittance_payments_to_state ON remittance_payments(to_state_id);
CREATE INDEX IF NOT EXISTS idx_remittance_payments_to_national ON remittance_payments(to_national_id);
CREATE INDEX IF NOT EXISTS idx_remittance_payments_status ON remittance_payments(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_remittance_payment_allocations_payment ON remittance_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_remittance_payment_allocations_remittance ON remittance_payment_allocations(remittance_id);

-- Function to update allocated amount on payment
CREATE OR REPLACE FUNCTION update_payment_allocated_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the allocated amount
  UPDATE remittance_payments
  SET allocated_amount = (
    SELECT COALESCE(SUM(allocated_amount), 0)
    FROM remittance_payment_allocations
    WHERE payment_id = COALESCE(NEW.payment_id, OLD.payment_id)
  ),
  reconciliation_status = CASE
    WHEN (SELECT COALESCE(SUM(allocated_amount), 0) FROM remittance_payment_allocations WHERE payment_id = COALESCE(NEW.payment_id, OLD.payment_id)) = 0 THEN 'pending'
    WHEN (SELECT COALESCE(SUM(allocated_amount), 0) FROM remittance_payment_allocations WHERE payment_id = COALESCE(NEW.payment_id, OLD.payment_id)) < total_amount THEN 'partial'
    ELSE 'completed'
  END,
  reconciled_at = CASE
    WHEN (SELECT COALESCE(SUM(allocated_amount), 0) FROM remittance_payment_allocations WHERE payment_id = COALESCE(NEW.payment_id, OLD.payment_id)) = total_amount 
    THEN now()
    ELSE NULL
  END,
  updated_at = now()
  WHERE id = COALESCE(NEW.payment_id, OLD.payment_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to update allocated amount
DROP TRIGGER IF EXISTS update_payment_allocated_amount_trigger ON remittance_payment_allocations;
CREATE TRIGGER update_payment_allocated_amount_trigger
  AFTER INSERT OR UPDATE OR DELETE ON remittance_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_allocated_amount();

-- Function to sync state payment status back to club
CREATE OR REPLACE FUNCTION sync_remittance_status_to_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_member_id uuid;
  v_state_fee numeric;
  v_national_fee numeric;
BEGIN
  -- Only process when club_to_state_status changes to 'paid' from state side
  IF NEW.club_to_state_status = 'paid' AND (OLD.club_to_state_status IS NULL OR OLD.club_to_state_status = 'pending') THEN
    
    -- Get club and member info
    SELECT club_id, member_id, state_contribution_amount, national_contribution_amount
    INTO v_club_id, v_member_id, v_state_fee, v_national_fee
    FROM membership_remittances
    WHERE id = NEW.id;
    
    -- Create expense in club finances if not already exists
    INSERT INTO finance_transactions (
      club_id,
      type,
      category_id,
      description,
      amount,
      date,
      payment_method,
      reference,
      payment_status,
      linked_entity_type,
      linked_entity_id
    )
    SELECT
      v_club_id,
      'expense',
      (SELECT id FROM finance_categories WHERE club_id = v_club_id AND system_key = 'state_association_fees' LIMIT 1),
      'State Association Membership Fee - ' || m.first_name || ' ' || m.last_name,
      v_state_fee,
      NEW.club_to_state_paid_date,
      'transfer',
      'REMIT-' || NEW.id,
      'completed',
      'membership_remittance',
      NEW.id
    FROM members m
    WHERE m.id = v_member_id
    ON CONFLICT (reference) DO NOTHING;
    
    -- Create expense for national fee if exists
    IF v_national_fee > 0 THEN
      INSERT INTO finance_transactions (
        club_id,
        type,
        category_id,
        description,
        amount,
        date,
        payment_method,
        reference,
        payment_status,
        linked_entity_type,
        linked_entity_id
      )
      SELECT
        v_club_id,
        'expense',
        (SELECT id FROM finance_categories WHERE club_id = v_club_id AND system_key = 'national_association_fees' LIMIT 1),
        'National Association Membership Fee - ' || m.first_name || ' ' || m.last_name,
        v_national_fee,
        NEW.club_to_state_paid_date,
        'transfer',
        'REMIT-NAT-' || NEW.id,
        'completed',
        'membership_remittance',
        NEW.id
      FROM members m
      WHERE m.id = v_member_id
      ON CONFLICT (reference) DO NOTHING;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync status from state to club
DROP TRIGGER IF EXISTS sync_remittance_status_to_club_trigger ON membership_remittances;
CREATE TRIGGER sync_remittance_status_to_club_trigger
  AFTER UPDATE ON membership_remittances
  FOR EACH ROW
  EXECUTE FUNCTION sync_remittance_status_to_club();

-- Function to allocate payment to remittance
CREATE OR REPLACE FUNCTION allocate_payment_to_remittance(
  p_payment_id uuid,
  p_remittance_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment remittance_payments;
  v_remittance membership_remittances;
  v_allocation_id uuid;
  v_expected_amount numeric;
BEGIN
  -- Get payment details
  SELECT * INTO v_payment FROM remittance_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Payment not found');
  END IF;
  
  -- Get remittance details
  SELECT * INTO v_remittance FROM membership_remittances WHERE id = p_remittance_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Remittance not found');
  END IF;
  
  -- Determine expected amount based on payment type
  IF v_payment.to_type = 'state' THEN
    v_expected_amount := v_remittance.state_contribution_amount;
  ELSIF v_payment.to_type = 'national' THEN
    v_expected_amount := v_remittance.national_contribution_amount;
  END IF;
  
  -- Check if payment has enough unallocated amount
  IF v_payment.unallocated_amount < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient unallocated amount');
  END IF;
  
  -- Create allocation
  INSERT INTO remittance_payment_allocations (
    payment_id,
    remittance_id,
    allocated_amount,
    allocated_by,
    notes
  ) VALUES (
    p_payment_id,
    p_remittance_id,
    p_amount,
    auth.uid(),
    p_notes
  )
  ON CONFLICT (payment_id, remittance_id) 
  DO UPDATE SET 
    allocated_amount = remittance_payment_allocations.allocated_amount + p_amount,
    notes = COALESCE(EXCLUDED.notes, remittance_payment_allocations.notes)
  RETURNING id INTO v_allocation_id;
  
  -- Update remittance status based on payment type
  IF v_payment.to_type = 'state' THEN
    UPDATE membership_remittances
    SET 
      club_to_state_status = 'paid',
      club_to_state_paid_date = v_payment.payment_date
    WHERE id = p_remittance_id;
  ELSIF v_payment.to_type = 'national' THEN
    UPDATE membership_remittances
    SET 
      state_to_national_status = 'paid',
      state_to_national_paid_date = v_payment.payment_date
    WHERE id = p_remittance_id;
  END IF;
  
  RETURN json_build_object(
    'success', true, 
    'allocation_id', v_allocation_id,
    'expected_amount', v_expected_amount,
    'allocated_amount', p_amount
  );
END;
$$;

-- RLS Policies for remittance_payments
ALTER TABLE remittance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payments for their associations"
  ON remittance_payments FOR SELECT
  TO authenticated
  USING (
    -- Club admins can view their club's payments
    (from_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = from_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin')
    ))
    OR
    -- State admins can view payments to/from their state
    (to_type = 'state' AND user_has_association_access(to_state_id, 'state'))
    OR
    (from_type = 'state' AND user_has_association_access(from_state_id, 'state'))
    OR
    -- National admins can view payments to their national association
    (to_type = 'national' AND user_has_association_access(to_national_id, 'national'))
  );

CREATE POLICY "Admins can create payments"
  ON remittance_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    (from_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = from_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin')
    ))
    OR
    (from_type = 'state' AND is_association_admin(from_state_id, 'state'))
  );

CREATE POLICY "Admins can update payments"
  ON remittance_payments FOR UPDATE
  TO authenticated
  USING (
    (to_type = 'state' AND is_association_admin(to_state_id, 'state'))
    OR
    (to_type = 'national' AND is_association_admin(to_national_id, 'national'))
  )
  WITH CHECK (
    (to_type = 'state' AND is_association_admin(to_state_id, 'state'))
    OR
    (to_type = 'national' AND is_association_admin(to_national_id, 'national'))
  );

-- RLS Policies for remittance_payment_allocations
ALTER TABLE remittance_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allocations for their payments"
  ON remittance_payment_allocations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM remittance_payments rp
      WHERE rp.id = payment_id
      AND (
        (rp.to_type = 'state' AND user_has_association_access(rp.to_state_id, 'state'))
        OR
        (rp.to_type = 'national' AND user_has_association_access(rp.to_national_id, 'national'))
        OR
        (rp.from_type = 'club' AND EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.club_id = rp.from_club_id
          AND uc.user_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY "Admins can create allocations"
  ON remittance_payment_allocations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM remittance_payments rp
      WHERE rp.id = payment_id
      AND (
        (rp.to_type = 'state' AND is_association_admin(rp.to_state_id, 'state'))
        OR
        (rp.to_type = 'national' AND is_association_admin(rp.to_national_id, 'national'))
      )
    )
  );

CREATE POLICY "Admins can delete allocations"
  ON remittance_payment_allocations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM remittance_payments rp
      WHERE rp.id = payment_id
      AND (
        (rp.to_type = 'state' AND is_association_admin(rp.to_state_id, 'state'))
        OR
        (rp.to_type = 'national' AND is_association_admin(rp.to_national_id, 'national'))
      )
    )
  );