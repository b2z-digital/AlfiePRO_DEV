/*
  # Create Invoice Transaction Triggers

  1. Triggers
    - When club invoice is marked as paid → Creates deposit transaction
    - When association invoice is marked as paid → Creates association income transaction
    - Automatic linking between invoices and transactions

  2. Security
    - SECURITY DEFINER ensures proper permissions
*/

-- Function to create club transaction when invoice is marked as paid
CREATE OR REPLACE FUNCTION create_club_invoice_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  -- Only proceed when invoice is marked as paid
  IF NEW.status = 'paid' AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND OLD.status != 'paid')
  ) THEN
    -- Get or create "Invoice Payments" income category
    SELECT id INTO v_category_id
    FROM budget_categories
    WHERE club_id = NEW.club_id
    AND system_key = 'invoice_payments'
    AND is_system = true;

    -- If category doesn't exist, create it
    IF v_category_id IS NULL THEN
      INSERT INTO budget_categories (
        club_id,
        name,
        type,
        description,
        is_system,
        system_key,
        is_active
      ) VALUES (
        NEW.club_id,
        'Invoice Payments',
        'income',
        'Payments received from invoices',
        true,
        'invoice_payments',
        true
      )
      RETURNING id INTO v_category_id;
    END IF;

    -- Create deposit transaction
    INSERT INTO transactions (
      club_id,
      type,
      category_id,
      description,
      amount,
      date,
      payment_method,
      reference,
      notes,
      payer,
      linked_entity_type,
      linked_entity_id,
      payment_status
    ) VALUES (
      NEW.club_id,
      'deposit',
      v_category_id,
      'Invoice Payment - ' || NEW.invoice_number || ' - ' || NEW.customer_name,
      NEW.total_amount,
      NEW.date,
      'invoice',
      NEW.reference,
      'Invoice ID: ' || NEW.id,
      NEW.customer_name,
      'invoice',
      NEW.id,
      'paid'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create association transaction when invoice is marked as paid
CREATE OR REPLACE FUNCTION create_association_invoice_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  -- Only proceed when invoice is marked as paid
  IF NEW.status = 'paid' AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND OLD.status != 'paid')
  ) THEN
    -- Get or create "Invoice Payments" income category
    SELECT id INTO v_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.association_id
    AND association_type = NEW.association_type
    AND system_key = 'invoice_payments';

    -- If category doesn't exist, create it
    IF v_category_id IS NULL THEN
      INSERT INTO association_budget_categories (
        association_id,
        association_type,
        name,
        type,
        description,
        is_system,
        system_key,
        is_active
      ) VALUES (
        NEW.association_id,
        NEW.association_type,
        'Invoice Payments',
        'income',
        'Payments received from invoices',
        true,
        'invoice_payments',
        true
      )
      RETURNING id INTO v_category_id;
    END IF;

    -- Create income transaction
    INSERT INTO association_transactions (
      association_id,
      association_type,
      type,
      category_id,
      description,
      amount,
      date,
      payment_method,
      reference,
      notes,
      payer,
      linked_entity_type,
      linked_entity_id,
      payment_status
    ) VALUES (
      NEW.association_id,
      NEW.association_type,
      'income',
      v_category_id,
      'Invoice Payment - ' || NEW.invoice_number || ' - ' || NEW.customer_name,
      NEW.total_amount,
      NEW.date,
      'invoice',
      NEW.reference,
      'Invoice ID: ' || NEW.id,
      NEW.customer_name,
      'invoice',
      NEW.id,
      'completed'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_club_invoice_payment ON invoices;
DROP TRIGGER IF EXISTS trigger_association_invoice_payment ON association_invoices;

-- Create triggers
CREATE TRIGGER trigger_club_invoice_payment
  AFTER INSERT OR UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION create_club_invoice_transaction();

CREATE TRIGGER trigger_association_invoice_payment
  AFTER INSERT OR UPDATE OF status ON association_invoices
  FOR EACH ROW
  EXECUTE FUNCTION create_association_invoice_transaction();
