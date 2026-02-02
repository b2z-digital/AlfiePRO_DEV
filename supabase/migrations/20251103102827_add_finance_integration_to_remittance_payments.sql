/*
  # Add Finance Integration for Remittance Payments

  1. New Features
    - Automatically create deposit transactions in association finances
    - Link remittance payments to finance transactions
    
  2. Changes
    - Add trigger to create finance transaction on payment insert
    - Track payment in association finance system
*/

-- Function to create finance transaction for remittance payment
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
  -- Get appropriate category based on payment type
  IF NEW.to_type = 'state' THEN
    -- Get state association name
    SELECT name INTO v_state_name FROM state_associations WHERE id = NEW.to_state_id;
    
    -- Get or create category for club remittances in state association finances
    SELECT id INTO v_category_id
    FROM association_finance_categories
    WHERE association_id = NEW.to_state_id
      AND association_type = 'state'
      AND system_key = 'club_remittances'
    LIMIT 1;
    
    -- If category doesn't exist, create it
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
    
    -- Create deposit transaction in state association finances
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
    -- Get national association name
    SELECT name INTO v_national_name FROM national_associations WHERE id = NEW.to_national_id;
    
    -- Get or create category for state remittances in national association finances
    SELECT id INTO v_category_id
    FROM association_finance_categories
    WHERE association_id = NEW.to_national_id
      AND association_type = 'national'
      AND system_key = 'state_remittances'
    LIMIT 1;
    
    -- If category doesn't exist, create it
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
    
    -- Create deposit transaction in national association finances
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
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS create_remittance_payment_deposit_trigger ON remittance_payments;
CREATE TRIGGER create_remittance_payment_deposit_trigger
  AFTER INSERT ON remittance_payments
  FOR EACH ROW
  EXECUTE FUNCTION create_remittance_payment_deposit();