/*
  # Fix Event Registration Finance Trigger - Use 'card' Instead of 'stripe'

  1. Problem
    - The trigger sets payment_method to 'stripe' for paid registrations
    - But the transactions table constraint only allows: 'cash', 'card', 'cheque', 'bank', 'other'
    - This causes "transactions_payment_method_check" constraint violation

  2. Solution
    - Change v_payment_method from 'stripe' to 'card' for online payments
    - Keep 'cash' for pay_at_event registrations

  3. Changes
    - Update the trigger function to use 'card' instead of 'stripe'
*/

CREATE OR REPLACE FUNCTION create_finance_transaction_from_event_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_participant_name text;
  v_event_name text;
  v_status text;
  v_transaction_date timestamptz;
  v_payment_method text;
BEGIN
  -- Only proceed for paid or pay_at_event registrations
  IF NEW.payment_status NOT IN ('paid', 'pay_at_event') THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an update and payment_status hasn't changed to paid/pay_at_event
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;
  END IF;

  -- Get or create the Event Entry Fees category
  v_category_id := ensure_event_entry_fees_category(NEW.club_id);

  -- Build participant name
  IF NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_participant_name
    FROM profiles
    WHERE id = NEW.user_id;
  ELSE
    v_participant_name := NEW.guest_first_name || ' ' || NEW.guest_last_name;
  END IF;

  -- Get event name from quick_races or public_events
  SELECT event_name INTO v_event_name
  FROM quick_races
  WHERE id = NEW.event_id
  LIMIT 1;

  IF v_event_name IS NULL THEN
    SELECT event_name INTO v_event_name
    FROM public_events
    WHERE id = NEW.event_id
    LIMIT 1;
  END IF;

  -- Build description
  v_description := 'Event Entry Fee';
  IF v_event_name IS NOT NULL THEN
    v_description := v_description || ' - ' || v_event_name;
  END IF;
  IF v_participant_name IS NOT NULL THEN
    v_description := v_description || ' (' || v_participant_name;
    IF NEW.sail_number IS NOT NULL THEN
      v_description := v_description || ' - Sail #' || NEW.sail_number;
    END IF;
    v_description := v_description || ')';
  END IF;

  -- Determine transaction status and payment method
  -- FIX: Use 'card' instead of 'stripe' to comply with transactions table constraint
  IF NEW.payment_status = 'paid' THEN
    v_status := 'paid';
    v_payment_method := 'card'; -- Changed from 'stripe' to 'card'
    v_transaction_date := now();
  ELSE -- pay_at_event
    v_status := 'awaiting_payment';
    v_payment_method := 'cash'; -- Default, can be changed during reconciliation
    v_transaction_date := now();
  END IF;

  -- Create the transaction in transactions table
  INSERT INTO transactions (
    club_id,
    category_id,
    type,
    amount,
    description,
    transaction_date,
    payment_method,
    reference_number,
    payment_status,
    notes,
    created_at,
    updated_at
  ) VALUES (
    NEW.club_id,
    v_category_id,
    'income',
    NEW.entry_fee_amount,
    v_description,
    v_transaction_date,
    v_payment_method,
    CASE 
      WHEN NEW.payment_status = 'paid' THEN NEW.stripe_payment_id
      ELSE 'REG-' || NEW.id
    END,
    v_status,
    CASE 
      WHEN NEW.payment_status = 'pay_at_event' 
      THEN 'Awaiting payment at registration desk. Registration ID: ' || NEW.id
      ELSE 'Paid online via Stripe. Registration ID: ' || NEW.id
    END,
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
