/*
  # Fix Association Transactions Payment Status

  1. Issue
    - Previous fix changed payment_status to 'paid' for ALL inserts
    - But association_transactions uses different values: 'completed', 'pending', 'failed'
    - transactions table uses: 'paid', 'awaiting_payment'
    
  2. Fix
    - Use 'paid' for transactions table (club expenses)
    - Use 'completed' for association_transactions table (state/national)
*/

-- Update club remittance transaction trigger
CREATE OR REPLACE FUNCTION create_club_remittance_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_member_name text;
  v_state_name text;
BEGIN
  -- Only proceed when club marks as paid to state
  IF NEW.club_to_state_status = 'paid' AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND OLD.club_to_state_status != 'paid')
  ) THEN
    -- Get state association name
    SELECT name INTO v_state_name
    FROM state_associations
    WHERE id = NEW.state_association_id;

    -- Get member name
    SELECT first_name || ' ' || last_name INTO v_member_name
    FROM members
    WHERE id = NEW.member_id;

    -- Get or create "Membership Remittances" expense category for club
    SELECT id INTO v_category_id
    FROM budget_categories
    WHERE club_id = NEW.club_id
    AND system_key = 'membership_remittances'
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
        'Membership Remittances',
        'expense',
        'Membership fee remittances to state and national associations',
        true,
        'membership_remittances',
        true
      )
      RETURNING id INTO v_category_id;
    END IF;

    -- Create club expense transaction (uses 'paid' for transactions table)
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
      payee,
      linked_entity_type,
      linked_entity_id,
      payment_status
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

    -- Create state association income transaction (uses 'completed' for association_transactions table)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update state-to-national remittance transaction trigger
CREATE OR REPLACE FUNCTION create_state_national_remittance_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_state_expense_category_id uuid;
  v_national_income_category_id uuid;
  v_state_transaction_id uuid;
  v_national_transaction_id uuid;
  v_batch_id uuid;
  v_state_name text;
  v_national_name text;
  v_member_name text;
BEGIN
  -- Only proceed when state marks as paid to national
  IF NEW.state_to_national_status = 'paid' AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND OLD.state_to_national_status != 'paid')
  ) THEN
    -- Get association names
    SELECT name INTO v_state_name
    FROM state_associations
    WHERE id = NEW.state_association_id;

    SELECT name INTO v_national_name
    FROM national_associations
    WHERE id = NEW.national_association_id;

    -- Get member name
    SELECT first_name || ' ' || last_name INTO v_member_name
    FROM members
    WHERE id = NEW.member_id;

    -- Get state expense category
    SELECT id INTO v_state_expense_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.state_association_id
    AND association_type = 'state'
    AND system_key = 'national_remittances';

    -- Get national income category
    SELECT id INTO v_national_income_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.national_association_id
    AND association_type = 'national'
    AND system_key = 'state_remittances';

    -- Create or get batch for this payment date
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
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_batch_id;

    -- If batch already exists, update it
    IF v_batch_id IS NULL THEN
      SELECT id INTO v_batch_id
      FROM remittance_payment_batches
      WHERE from_association_id = NEW.state_association_id
      AND to_association_id = NEW.national_association_id
      AND payment_date = COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE)
      ORDER BY created_at DESC
      LIMIT 1;

      -- Update batch totals
      UPDATE remittance_payment_batches
      SET 
        total_amount = total_amount + NEW.national_contribution_amount,
        member_count = member_count + 1
      WHERE id = v_batch_id;
    END IF;

    -- Create state expense transaction (uses 'completed' for association_transactions table)
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
      'Membership Remittance to National Association - ' || COALESCE(v_member_name, 'Member'),
      NEW.national_contribution_amount,
      COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE),
      'bank',
      NEW.state_to_national_payment_reference,
      'Remittance ID: ' || NEW.id || ' | Batch ID: ' || v_batch_id,
      v_national_name,
      'remittance',
      NEW.id,
      v_batch_id,
      'completed'
    )
    RETURNING id INTO v_state_transaction_id;

    -- Create national income transaction (uses 'completed' for association_transactions table)
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
      'Membership Remittance from ' || COALESCE(v_state_name, 'State Association') || ' - ' || COALESCE(v_member_name, 'Member'),
      NEW.national_contribution_amount,
      COALESCE(NEW.state_to_national_paid_date, CURRENT_DATE),
      'bank',
      NEW.state_to_national_payment_reference,
      'Remittance ID: ' || NEW.id || ' | Batch ID: ' || v_batch_id,
      v_state_name,
      'remittance',
      NEW.id,
      v_batch_id,
      'completed'
    )
    RETURNING id INTO v_national_transaction_id;

    -- Update batch with transaction IDs
    UPDATE remittance_payment_batches
    SET 
      state_transaction_id = v_state_transaction_id,
      national_transaction_id = v_national_transaction_id
    WHERE id = v_batch_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;