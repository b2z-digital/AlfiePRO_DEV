/*
  # Add Status Field to Remittance Payments

  1. Changes
    - Add status column with three states
    - Update trigger to only create deposit on reconciliation
    
  2. States
    - draft: Payment entered but not yet matched
    - pending_reconciliation: Payment exists, ready for matching
    - reconciled: Fully matched to members
*/

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remittance_payments' AND column_name = 'status'
  ) THEN
    ALTER TABLE remittance_payments
    ADD COLUMN status text DEFAULT 'pending_reconciliation'
    CHECK (status IN ('draft', 'pending_reconciliation', 'reconciled'));
  END IF;
END $$;

-- Update existing payments to pending_reconciliation
UPDATE remittance_payments
SET status = 'pending_reconciliation'
WHERE status IS NULL;

-- Drop old trigger
DROP TRIGGER IF EXISTS create_remittance_payment_deposit_trigger ON remittance_payments;

-- Update function to only fire on reconciliation
CREATE OR REPLACE FUNCTION create_remittance_payment_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_state_name text;
  v_national_name text;
  v_club_name text;
BEGIN
  -- Only create deposit when status changes to reconciled
  IF NEW.status = 'reconciled' AND (OLD.status IS NULL OR OLD.status != 'reconciled') THEN
    
    -- Get appropriate category based on payment type
    IF NEW.to_type = 'state' THEN
      -- Get state association name
      SELECT name INTO v_state_name FROM state_associations WHERE id = NEW.to_state_id;
      
      -- Get or create category for club remittances
      SELECT id INTO v_category_id
      FROM association_finance_categories
      WHERE association_id = NEW.to_state_id
        AND association_type = 'state'
        AND system_key = 'club_remittances'
      LIMIT 1;
      
      IF v_category_id IS NULL THEN
        INSERT INTO association_finance_categories (
          association_id,
          association_type,
          name,
          type,
          system_key,
          is_system
        )
        VALUES (
          NEW.to_state_id,
          'state',
          'Club Remittances',
          'income',
          'club_remittances',
          true
        )
        RETURNING id INTO v_category_id;
      END IF;
      
      -- Get club name if available
      IF NEW.from_club_id IS NOT NULL THEN
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.from_club_id;
      END IF;
      
      -- Create deposit transaction
      INSERT INTO association_finance_transactions (
        association_id,
        association_type,
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
      VALUES (
        NEW.to_state_id,
        'state',
        'deposit',
        v_category_id,
        'Member Remittance Payment' || COALESCE(' from ' || v_club_name, '') || ' - ' || NEW.payment_reference,
        NEW.total_amount,
        NEW.payment_date,
        NEW.payment_method,
        'REM-PAY-' || NEW.id,
        'completed',
        'remittance_payment',
        NEW.id
      )
      ON CONFLICT (reference) DO NOTHING;
      
    ELSIF NEW.to_type = 'national' THEN
      -- Similar logic for national
      SELECT id INTO v_category_id
      FROM association_finance_categories
      WHERE association_id = NEW.to_national_id
        AND association_type = 'national'
        AND system_key = 'state_remittances'
      LIMIT 1;
      
      IF v_category_id IS NULL THEN
        INSERT INTO association_finance_categories (
          association_id,
          association_type,
          name,
          type,
          system_key,
          is_system
        )
        VALUES (
          NEW.to_national_id,
          'national',
          'State Remittances',
          'income',
          'state_remittances',
          true
        )
        RETURNING id INTO v_category_id;
      END IF;
      
      INSERT INTO association_finance_transactions (
        association_id,
        association_type,
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
      VALUES (
        NEW.to_national_id,
        'national',
        'deposit',
        v_category_id,
        'State Remittance Payment - ' || NEW.payment_reference,
        NEW.total_amount,
        NEW.payment_date,
        NEW.payment_method,
        'REM-PAY-' || NEW.id,
        'completed',
        'remittance_payment',
        NEW.id
      )
      ON CONFLICT (reference) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger to fire on UPDATE instead of INSERT
CREATE TRIGGER create_remittance_payment_deposit_trigger
  AFTER INSERT OR UPDATE ON remittance_payments
  FOR EACH ROW
  EXECUTE FUNCTION create_remittance_payment_deposit();

-- Function to auto-update status when fully allocated
CREATE OR REPLACE FUNCTION update_payment_status_on_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment remittance_payments;
BEGIN
  -- Get payment details
  SELECT * INTO v_payment
  FROM remittance_payments
  WHERE id = COALESCE(NEW.payment_id, OLD.payment_id);
  
  -- If payment is now fully allocated, mark as reconciled
  IF v_payment.unallocated_amount <= 0.01 THEN
    UPDATE remittance_payments
    SET status = 'reconciled'
    WHERE id = v_payment.id
      AND status != 'reconciled';
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add trigger to auto-update status
DROP TRIGGER IF EXISTS update_payment_status_trigger ON remittance_payment_allocations;
CREATE TRIGGER update_payment_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON remittance_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_status_on_allocation();