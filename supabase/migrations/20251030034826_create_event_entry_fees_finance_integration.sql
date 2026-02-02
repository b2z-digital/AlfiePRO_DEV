/*
  # Event Entry Fees Finance Integration

  1. New System Category
    - Creates "Event Entry Fees" as a system category
    - Marks it with system_key 'event_entry_fees'
    - Type: income
    - Auto-created for all clubs

  2. Integration with Event Registrations
    - When event registration payment status changes to 'paid' (Stripe), create income transaction
    - When payment_status is 'pay_at_event', create pending transaction for reconciliation
    - Links transactions to Event Entry Fees category
    - Stores registration details in transaction notes

  3. Transaction Types
    - Paid online (Stripe): Creates completed income transaction immediately
    - Pay at event: Creates pending transaction awaiting reconciliation
    - Reconciliation: Admin can mark pending transactions as paid

  4. Security
    - Uses existing RLS policies on budget_categories and transactions tables
    - Trigger runs with SECURITY DEFINER to bypass RLS
*/

-- Function to ensure Event Entry Fees category exists for a club
CREATE OR REPLACE FUNCTION ensure_event_entry_fees_category(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id uuid;
  v_default_tax_rate_id uuid;
BEGIN
  -- Check if category already exists
  SELECT id INTO v_category_id
  FROM budget_categories
  WHERE club_id = p_club_id 
    AND system_key = 'event_entry_fees'
    AND is_active = true;

  -- If found, return it
  IF v_category_id IS NOT NULL THEN
    RETURN v_category_id;
  END IF;

  -- Get default tax rate for the club (if any)
  SELECT id INTO v_default_tax_rate_id
  FROM tax_rates
  WHERE club_id = p_club_id 
    AND is_default = true 
    AND is_active = true
  LIMIT 1;

  -- Create the category
  INSERT INTO budget_categories (
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

-- Create the Event Entry Fees category for all existing clubs
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN 
    SELECT id FROM clubs WHERE id NOT IN (
      SELECT club_id FROM budget_categories 
      WHERE system_key = 'event_entry_fees' AND is_active = true
    )
  LOOP
    PERFORM ensure_event_entry_fees_category(club_record.id);
  END LOOP;
END $$;

-- Function to create finance transaction from event registration
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
  IF NEW.payment_status = 'paid' THEN
    v_status := 'completed';
    v_payment_method := 'stripe';
    v_transaction_date := now();
  ELSE -- pay_at_event
    v_status := 'pending';
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
    status,
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS event_registration_creates_finance_transaction ON event_registrations;

-- Create trigger for event registration finance integration
CREATE TRIGGER event_registration_creates_finance_transaction
  AFTER INSERT OR UPDATE OF payment_status ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION create_finance_transaction_from_event_registration();
