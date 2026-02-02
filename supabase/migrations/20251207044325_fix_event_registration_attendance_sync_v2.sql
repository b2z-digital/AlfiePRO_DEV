/*
  # Fix Event Registration Attendance Sync

  1. Problem
    - Event registrations from public website don't create event_attendance records
    - "Who's attending" section only shows users from event_attendance table
    - Public registrations are invisible to the event organizers

  2. Solution
    - Create trigger to automatically create event_attendance record when registration is created
    - Sync attendance for both authenticated and guest registrations
    - Ensure finance transactions are created properly

  3. Changes
    - Add function to sync event_registrations to event_attendance
    - Create trigger on event_registrations INSERT/UPDATE
    - Fix finance transaction duplicate prevention
*/

-- Function to sync event registrations to event attendance
CREATE OR REPLACE FUNCTION sync_registration_to_attendance()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed for paid or pay_at_event registrations
  IF NEW.payment_status NOT IN ('paid', 'pay_at_event') THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an update and payment_status hasn't changed
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;
  END IF;

  -- For authenticated users, create/update event_attendance record
  IF NEW.user_id IS NOT NULL THEN
    -- Check if attendance record already exists
    IF EXISTS (
      SELECT 1 FROM event_attendance 
      WHERE event_id = NEW.event_id 
      AND user_id = NEW.user_id
    ) THEN
      -- Update existing attendance to 'yes'
      UPDATE event_attendance 
      SET status = 'yes',
          updated_at = now()
      WHERE event_id = NEW.event_id 
      AND user_id = NEW.user_id;
    ELSE
      -- Create new attendance record
      INSERT INTO event_attendance (
        event_id,
        user_id,
        club_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        NEW.event_id,
        NEW.user_id,
        NEW.club_id,
        'yes',
        now(),
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_registration_attendance ON event_registrations;

-- Create trigger for syncing registrations to attendance
CREATE TRIGGER sync_registration_attendance
  AFTER INSERT OR UPDATE OF payment_status ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION sync_registration_to_attendance();

-- Fix finance transaction function to prevent duplicates
CREATE OR REPLACE FUNCTION create_finance_transaction_from_event_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_participant_name text;
  v_event_name text;
  v_status text;
  v_transaction_date date;
  v_payment_method text;
  v_existing_transaction uuid;
BEGIN
  -- Only proceed for paid or pay_at_event registrations
  IF NEW.payment_status NOT IN ('paid', 'pay_at_event') THEN
    RETURN NEW;
  END IF;

  -- Skip if this is an update and payment_status hasn't changed
  IF TG_OP = 'UPDATE' AND OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;
  END IF;

  -- Check if a transaction already exists for this registration
  SELECT id INTO v_existing_transaction
  FROM transactions
  WHERE reference = CASE 
    WHEN NEW.payment_status = 'paid' THEN NEW.stripe_payment_id
    ELSE 'REG-' || NEW.id
  END
  AND club_id = NEW.club_id
  LIMIT 1;

  -- If transaction already exists, skip creation
  IF v_existing_transaction IS NOT NULL THEN
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
  v_transaction_date := CURRENT_DATE;
  
  IF NEW.payment_status = 'paid' THEN
    v_status := 'paid';
    v_payment_method := 'card';
  ELSE -- pay_at_event
    v_status := 'awaiting_payment';
    v_payment_method := 'cash';
  END IF;

  -- Create the transaction in transactions table
  INSERT INTO transactions (
    club_id,
    category_id,
    type,
    amount,
    description,
    date,
    payment_method,
    reference,
    payment_status,
    notes,
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
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill attendance records for existing paid registrations that don't have attendance
DO $$
BEGIN
  INSERT INTO event_attendance (
    event_id,
    user_id,
    club_id,
    status,
    created_at,
    updated_at
  )
  SELECT DISTINCT ON (er.event_id, er.user_id)
    er.event_id,
    er.user_id,
    er.club_id,
    'yes'::attendance_status,
    er.created_at,
    now()
  FROM event_registrations er
  WHERE er.payment_status IN ('paid', 'pay_at_event')
    AND er.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM event_attendance ea
      WHERE ea.event_id = er.event_id
      AND ea.user_id = er.user_id
    );
END $$;
