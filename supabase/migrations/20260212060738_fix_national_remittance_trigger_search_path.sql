/*
  # Fix national remittance trigger search_path

  1. Problem
    - The `create_state_national_remittance_transaction` trigger function was missing
      `SET search_path = public`, causing it to silently fail when called through
      the PostgREST API (frontend updates)
    - The club-to-state trigger had this fix applied previously, but the national
      trigger was missed

  2. Fix
    - Recreate the function with `SET search_path = public` to ensure all table
      references resolve correctly in the PostgREST context
    - No logic changes, only the search_path configuration is added

  3. Impact
    - Finance records (expense + income transactions, payment batches) will now be
      properly created when national remittances are marked as paid from the frontend
*/

CREATE OR REPLACE FUNCTION create_state_national_remittance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_expense_category_id uuid;
  v_national_income_category_id uuid;
  v_state_transaction_id uuid;
  v_national_transaction_id uuid;
  v_batch_id uuid;
  v_state_name text;
  v_national_name text;
  v_member_name text;
  v_member_count integer;
  v_total_amount numeric;
BEGIN
  IF NEW.state_to_national_status = 'paid' AND (
    TG_OP = 'INSERT' OR
    (TG_OP = 'UPDATE' AND OLD.state_to_national_status != 'paid')
  ) THEN
    SELECT name INTO v_state_name
    FROM state_associations
    WHERE id = NEW.state_association_id;

    SELECT name INTO v_national_name
    FROM national_associations
    WHERE id = NEW.national_association_id;

    SELECT first_name || ' ' || last_name INTO v_member_name
    FROM members
    WHERE id = NEW.member_id;

    SELECT id INTO v_state_expense_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.state_association_id
    AND association_type = 'state'
    AND system_key = 'national_remittances';

    SELECT id INTO v_national_income_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.national_association_id
    AND association_type = 'national'
    AND system_key = 'state_remittances';

    SELECT id, member_count, total_amount INTO v_batch_id, v_member_count, v_total_amount
    FROM remittance_payment_batches
    WHERE from_association_id = NEW.state_association_id
    AND to_association_id = NEW.national_association_id
    AND payment_date = COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE)
    AND (
      payment_reference = NEW.state_to_national_payment_reference
      OR (payment_reference IS NULL AND NEW.state_to_national_payment_reference IS NULL)
    )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_batch_id IS NOT NULL THEN
      UPDATE remittance_payment_batches
      SET
        total_amount = total_amount + NEW.national_contribution_amount,
        member_count = member_count + 1,
        updated_at = now()
      WHERE id = v_batch_id;

      UPDATE association_transactions
      SET
        amount = v_total_amount + NEW.national_contribution_amount,
        description = 'Membership Remittance to National Association - ' || (v_member_count + 1) || ' members',
        updated_at = now()
      WHERE batch_id = v_batch_id
      AND association_id = NEW.state_association_id
      AND type = 'expense';

      UPDATE association_transactions
      SET
        amount = v_total_amount + NEW.national_contribution_amount,
        description = 'Membership Remittance from ' || COALESCE(v_state_name, 'State Association') || ' - ' || (v_member_count + 1) || ' members',
        updated_at = now()
      WHERE batch_id = v_batch_id
      AND association_id = NEW.national_association_id
      AND type = 'income';

    ELSE
      INSERT INTO remittance_payment_batches (
        from_association_id,
        from_association_type,
        to_association_id,
        to_association_type,
        total_amount,
        member_count,
        payment_date,
        payment_method,
        payment_reference
      ) VALUES (
        NEW.state_association_id,
        'state',
        NEW.national_association_id,
        'national',
        NEW.national_contribution_amount,
        1,
        COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE),
        'bank',
        NEW.state_to_national_payment_reference
      )
      RETURNING id INTO v_batch_id;

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
        payee,
        linked_entity_type,
        linked_entity_id,
        batch_id,
        payment_status
      ) VALUES (
        NEW.state_association_id,
        'state',
        'expense',
        v_state_expense_category_id,
        'Membership Remittance to National Association - 1 member',
        NEW.national_contribution_amount,
        COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE),
        'bank',
        NEW.state_to_national_payment_reference,
        'Batch ID: ' || v_batch_id,
        v_national_name,
        'remittance',
        NEW.id,
        v_batch_id,
        'completed'
      )
      RETURNING id INTO v_state_transaction_id;

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
        batch_id,
        payment_status
      ) VALUES (
        NEW.national_association_id,
        'national',
        'income',
        v_national_income_category_id,
        'Membership Remittance from ' || COALESCE(v_state_name, 'State Association') || ' - 1 member',
        NEW.national_contribution_amount,
        COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE),
        'bank',
        NEW.state_to_national_payment_reference,
        'Batch ID: ' || v_batch_id,
        v_state_name,
        'remittance',
        NEW.id,
        v_batch_id,
        'completed'
      )
      RETURNING id INTO v_national_transaction_id;

      UPDATE remittance_payment_batches
      SET
        state_transaction_id = v_state_transaction_id,
        national_transaction_id = v_national_transaction_id
      WHERE id = v_batch_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
