/*
  # Fix Event Registration Finance Integration Schema Qualification

  1. Problem
    - The trigger function `create_finance_transaction_from_event_registration` has `search_path TO ''`
    - This requires all table and function references to be schema-qualified
    - Current function calls `ensure_event_entry_fees_category()` without `public.` prefix
    - All table references (profiles, quick_races, public_events, transactions) need `public.` prefix

  2. Changes
    - Recreate function with proper schema qualification for:
      - Function call: `public.ensure_event_entry_fees_category()`
      - All table references: `public.profiles`, `public.quick_races`, etc.
    - Also fix the `ensure_event_entry_fees_category` function table references

  3. Security
    - Maintains SECURITY DEFINER to bypass RLS
    - Maintains search_path TO '' for security
*/

-- Fix ensure_event_entry_fees_category function with schema-qualified table references
CREATE OR REPLACE FUNCTION public.ensure_event_entry_fees_category(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_category_id uuid;
  v_default_tax_rate_id uuid;
BEGIN
  -- Check if category already exists
  SELECT id INTO v_category_id
  FROM public.budget_categories
  WHERE club_id = p_club_id 
    AND system_key = 'event_entry_fees'
    AND is_active = true;

  -- If found, return it
  IF v_category_id IS NOT NULL THEN
    RETURN v_category_id;
  END IF;

  -- Get default tax rate for the club (if any)
  SELECT id INTO v_default_tax_rate_id
  FROM public.tax_rates
  WHERE club_id = p_club_id 
    AND is_default = true 
    AND is_active = true
  LIMIT 1;

  -- Create the category
  INSERT INTO public.budget_categories (
    club_id,
    name,
    type,
    description,
    is_system,
    system_key,
    is_active,
    tax_rate_id,
    created_at,
    updated_at
  ) VALUES (
    p_club_id,
    'Event Entry Fees',
    'income',
    'Entry fees from racing events and competitions',
    true,
    'event_entry_fees',
    true,
    v_default_tax_rate_id,
    now(),
    now()
  )
  RETURNING id INTO v_category_id;

  RETURN v_category_id;
END;
$$;

-- Fix create_finance_transaction_from_event_registration with schema-qualified references
CREATE OR REPLACE FUNCTION public.create_finance_transaction_from_event_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_participant_name text;
  v_event_name text;
  v_payment_status text;
  v_transaction_date date;
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

  -- Get or create the Event Entry Fees category (with schema qualification)
  v_category_id := public.ensure_event_entry_fees_category(NEW.club_id);

  -- Build participant name
  IF NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_participant_name
    FROM public.profiles
    WHERE id = NEW.user_id;
  ELSE
    v_participant_name := NEW.guest_first_name || ' ' || NEW.guest_last_name;
  END IF;

  -- Get event name from quick_races or public_events
  SELECT event_name INTO v_event_name
  FROM public.quick_races
  WHERE id = NEW.event_id
  LIMIT 1;

  IF v_event_name IS NULL THEN
    SELECT event_name INTO v_event_name
    FROM public.public_events
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
    v_payment_method := 'stripe';
    v_transaction_date := CURRENT_DATE;
  ELSE -- pay_at_event
    v_payment_status := 'awaiting_payment';
    v_payment_method := 'cash';
    v_transaction_date := CURRENT_DATE;
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
$$;
