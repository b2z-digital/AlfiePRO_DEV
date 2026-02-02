/*
  # Fix Event Payment Finance Integration Trigger

  1. Changes
    - Drop and recreate the trigger function to use correct table names
    - Use `transactions` instead of `finance_transactions`
    - Use `budget_categories` instead of `finance_categories`
    - Match the correct column structure
    
  2. Details
    - When event_payment_transactions payment_status changes to 'completed'
    - Creates a corresponding entry in the transactions table
    - Uses 'Event Fees' budget category (creates if doesn't exist)
    - Maps payment method correctly (stripe → 'card')
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS event_payment_creates_financial_transaction ON event_payment_transactions;
DROP FUNCTION IF EXISTS create_financial_transaction_for_event_payment();

-- Recreate function with correct table and column names
CREATE OR REPLACE FUNCTION create_financial_transaction_for_event_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_participant_name text;
  v_payment_method text;
BEGIN
  -- Only proceed if payment status changed to 'completed'
  IF NEW.payment_status = 'completed' AND (OLD IS NULL OR OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN

    -- Get the event fees category
    SELECT id INTO v_category_id
    FROM budget_categories
    WHERE club_id = NEW.club_id
    AND name = 'Event Fees'
    LIMIT 1;

    -- If category doesn't exist, create it
    IF v_category_id IS NULL THEN
      INSERT INTO budget_categories (club_id, name, type, description, color)
      VALUES (NEW.club_id, 'Event Fees', 'income', 'Income from event entry fees', '#10b981')
      RETURNING id INTO v_category_id;
    END IF;

    -- Get participant name from registration
    SELECT
      CASE
        WHEN er.registration_type = 'guest' THEN er.guest_first_name || ' ' || er.guest_last_name
        ELSE COALESCE(p.first_name || ' ' || p.last_name, 'Unknown')
      END
    INTO v_participant_name
    FROM event_registrations er
    LEFT JOIN profiles p ON er.user_id = p.id
    WHERE er.id = NEW.registration_id;

    -- Build description
    v_description := 'Event Entry Fee';
    IF v_participant_name IS NOT NULL THEN
      v_description := v_description || ' - ' || v_participant_name;
    END IF;
    IF NEW.notes IS NOT NULL THEN
      v_description := v_description || ' (' || NEW.notes || ')';
    END IF;

    -- Map payment method
    v_payment_method := CASE NEW.payment_method
      WHEN 'stripe' THEN 'card'
      WHEN 'cash' THEN 'cash'
      WHEN 'bank_transfer' THEN 'bank_transfer'
      ELSE 'other'
    END;

    -- Create transaction
    INSERT INTO transactions (
      club_id,
      category_id,
      type,
      amount,
      description,
      date,
      payer,
      reference,
      notes,
      created_at,
      updated_at
    ) VALUES (
      NEW.club_id,
      v_category_id,
      'deposit',
      NEW.amount,
      v_description,
      COALESCE(NEW.transaction_date::date, CURRENT_DATE),
      v_participant_name,
      NEW.stripe_payment_intent_id,
      'Payment method: ' || v_payment_method,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER event_payment_creates_financial_transaction
  AFTER INSERT OR UPDATE ON event_payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_transaction_for_event_payment();
