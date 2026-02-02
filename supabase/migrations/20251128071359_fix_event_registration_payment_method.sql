/*
  # Fix Event Registration Finance Integration Payment Method

  1. Changes
    - Update trigger to use 'card' instead of 'stripe' for online payments
    - Use 'cash' for pay_at_event registrations
    - This matches the transactions table payment_method constraint
*/

-- Update the trigger function to use correct payment methods
CREATE OR REPLACE FUNCTION create_finance_transaction_from_event_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_participant_name text;
  v_event_name text;
  v_payment_status text;
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
  IF NEW.payment_status = 'paid' THEN
    v_payment_status := 'paid';
    v_payment_method := 'card'; -- Use 'card' for Stripe payments
    v_transaction_date := now();
  ELSE -- pay_at_event
    v_payment_status := 'pending';
    v_payment_method := 'cash'; -- Default to cash for in-person payments
    v_transaction_date := now();
  END IF;

  -- Create the transaction in transactions table
  INSERT INTO public.transactions (
    club_id,
    category_id,
    type,
    amount,
    description,
    date,
    payment_method,
    reference,
    transaction_reference,
    payment_status,
    payment_gateway,
    gateway_transaction_id,
    payer,
    notes,
    linked_entity_type,
    linked_entity_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.club_id,
    v_category_id,
    'deposit',
    NEW.entry_fee_amount,
    v_description,
    v_transaction_date,
    v_payment_method,
    CASE 
      WHEN NEW.payment_status = 'paid' THEN NEW.stripe_payment_id
      ELSE 'REG-' || NEW.id
    END,
    CASE 
      WHEN NEW.payment_status = 'paid' THEN NEW.stripe_payment_id
      ELSE NULL
    END,
    v_payment_status,
    CASE WHEN NEW.payment_status = 'paid' THEN 'stripe' ELSE NULL END,
    CASE WHEN NEW.payment_status = 'paid' THEN NEW.stripe_payment_id ELSE NULL END,
    v_participant_name,
    CASE 
      WHEN NEW.payment_status = 'pay_at_event' 
      THEN 'Awaiting payment at registration desk. Registration ID: ' || NEW.id
      ELSE 'Paid online via Stripe. Registration ID: ' || NEW.id
    END,
    'event_registration',
    NEW.id,
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
