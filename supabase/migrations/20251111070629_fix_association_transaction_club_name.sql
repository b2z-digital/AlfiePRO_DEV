/*
  # Fix Association Transaction Club Name

  This migration fixes the create_club_remittance_transaction function to properly
  capture the club name in association transactions.

  1. Changes
    - Fetch club name at the beginning of the function
    - Use the club name variable in the INSERT statement
  
  2. Security
    - Maintains SECURITY DEFINER with proper security
*/

CREATE OR REPLACE FUNCTION public.create_club_remittance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_category_id uuid;
  v_member_name text;
  v_state_name text;
  v_club_name text;
  v_state_category_id uuid;
BEGIN
  -- Skip if this is a bulk payment (handled by frontend)
  IF NEW.bulk_payment = true THEN
    RETURN NEW;
  END IF;

  -- Only proceed when club marks as paid to state
  IF NEW.club_to_state_status = 'paid' AND (
    TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND OLD.club_to_state_status != 'paid')
  ) THEN
    -- Get club name
    SELECT name INTO v_club_name
    FROM clubs
    WHERE id = NEW.club_id;

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

    -- Get or create state association category
    SELECT id INTO v_state_category_id
    FROM association_budget_categories
    WHERE association_id = NEW.state_association_id 
      AND association_type = 'state'
      AND system_key = 'club_remittances';

    -- If category doesn't exist, create it
    IF v_state_category_id IS NULL THEN
      INSERT INTO association_budget_categories (
        association_id,
        association_type,
        name,
        type,
        is_system,
        system_key,
        description
      ) VALUES (
        NEW.state_association_id,
        'state',
        'Club Membership Remittances',
        'income',
        true,
        'club_remittances',
        'Membership fee remittances from clubs'
      )
      RETURNING id INTO v_state_category_id;
    END IF;

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
    ) VALUES (
      NEW.state_association_id,
      'state',
      'income',
      v_state_category_id,
      'Membership Remittance from ' || COALESCE(v_club_name, 'Unknown Club') || ' - ' || COALESCE(v_member_name, 'Member'),
      NEW.state_contribution_amount,
      COALESCE(NEW.club_to_state_paid_date, CURRENT_DATE),
      'bank',
      NEW.club_to_state_payment_reference,
      'Remittance ID: ' || NEW.id,
      COALESCE(v_club_name, 'Unknown Club'),
      'remittance',
      NEW.id,
      'completed'
    );
  END IF;

  RETURN NEW;
END;
$function$;