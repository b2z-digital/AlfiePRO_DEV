/*
  # Fix duplicate finance transactions for bulk remittance payments

  When a bulk payment is made for multiple members, the ClubRemittanceDashboard
  creates a single consolidated expense transaction. However, the database trigger
  `create_club_remittance_transaction` also fires for each individual remittance
  update, creating duplicate individual transactions.

  ## Changes
  - Updated `create_club_remittance_transaction()` to skip when `bulk_payment = true`
  - This ensures only the single bulk transaction from the application code is recorded

  ## Important Notes
  1. The `bulk_payment` flag on membership_remittances indicates the payment was
     part of a bulk operation and the finance transaction was already created
  2. Individual (non-bulk) payments will continue to create transactions via the trigger
*/

CREATE OR REPLACE FUNCTION create_club_remittance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_member_name text;
  v_state_name text;
BEGIN
  IF NEW.club_to_state_status = 'paid' AND (
    TG_OP = 'INSERT' OR
    (TG_OP = 'UPDATE' AND OLD.club_to_state_status != 'paid')
  ) THEN

    IF NEW.bulk_payment = true THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_state_name
    FROM state_associations
    WHERE id = NEW.state_association_id;

    SELECT first_name || ' ' || last_name INTO v_member_name
    FROM members
    WHERE id = NEW.member_id;

    SELECT id INTO v_category_id
    FROM budget_categories
    WHERE club_id = NEW.club_id
      AND system_key = 'membership_remittances'
      AND is_system = true;

    IF v_category_id IS NULL THEN
      INSERT INTO budget_categories (
        club_id, name, type, description, is_system, system_key, is_active
      ) VALUES (
        NEW.club_id,
        'Membership Remittances',
        'expense',
        'Membership fee remittances to state and national associations',
        true,
        'membership_remittances',
        true
      )
      RETURNING id INTO v_category_id;
    END IF;

    INSERT INTO transactions (
      club_id, type, category_id, description, amount, date,
      payment_method, reference, notes, payee,
      linked_entity_type, linked_entity_id, payment_status
    ) VALUES (
      NEW.club_id,
      'expense',
      v_category_id,
      'Membership Remittance to State Association - ' || COALESCE(v_member_name, 'Member'),
      NEW.state_contribution_amount,
      COALESCE(NEW.club_to_state_paid_date, CURRENT_DATE),
      'bank',
      NEW.club_to_state_payment_reference,
      'Remittance ID: ' || NEW.id || ' | State: ' || COALESCE(v_state_name, 'N/A'),
      v_state_name,
      'remittance',
      NEW.id,
      'paid'
    );

    INSERT INTO association_transactions (
      association_id, association_type, type, category_id, description,
      amount, date, payment_method, reference, notes, payer,
      linked_entity_type, linked_entity_id, payment_status
    )
    SELECT
      NEW.state_association_id,
      'state',
      'income',
      abc.id,
      'Membership Remittance from ' || c.name || ' - ' || COALESCE(v_member_name, 'Member'),
      NEW.state_contribution_amount,
      COALESCE(NEW.club_to_state_paid_date, CURRENT_DATE),
      'bank',
      NEW.club_to_state_payment_reference,
      'Remittance ID: ' || NEW.id,
      c.name,
      'remittance',
      NEW.id,
      'completed'
    FROM clubs c
    LEFT JOIN association_budget_categories abc ON
      abc.association_id = NEW.state_association_id
      AND abc.association_type = 'state'
      AND abc.system_key = 'club_remittances'
    WHERE c.id = NEW.club_id;
  END IF;

  RETURN NEW;
END;
$$;
