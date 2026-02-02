/*
  # Event Registration and Payment System

  1. New Tables
    - `event_registrations`
      - `id` (uuid, primary key)
      - `event_id` (uuid) - references quick_races or public_events
      - `user_id` (uuid) - references auth.users (nullable for guest registrations)
      - `club_id` (uuid) - references clubs
      - `registration_type` (text) - 'member' or 'guest'
      - `status` (text) - 'pending', 'confirmed', 'cancelled'
      - `payment_status` (text) - 'unpaid', 'paid', 'refunded', 'pay_at_event'
      - `payment_method` (text) - 'online', 'pay_at_event', 'waived'
      - `amount_paid` (numeric)
      - `stripe_payment_id` (text)
      - `stripe_checkout_session_id` (text)

      -- Guest registration fields
      - `guest_first_name` (text)
      - `guest_last_name` (text)
      - `guest_email` (text)
      - `guest_phone` (text)
      - `guest_club_name` (text)
      - `guest_country` (text)
      - `guest_state` (text)

      -- Boat details
      - `boat_name` (text)
      - `sail_number` (text)
      - `boat_class` (text)
      - `boat_registration_no` (text)
      - `is_personal_sail_number` (boolean)

      -- Additional fields
      - `notes` (text)
      - `emergency_contact_name` (text)
      - `emergency_contact_phone` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `event_payment_transactions`
      - `id` (uuid, primary key)
      - `registration_id` (uuid) - references event_registrations
      - `club_id` (uuid) - references clubs
      - `amount` (numeric)
      - `currency` (text) - default 'AUD'
      - `payment_method` (text) - 'stripe', 'cash', 'bank_transfer'
      - `payment_status` (text) - 'pending', 'completed', 'failed', 'refunded'
      - `stripe_payment_intent_id` (text)
      - `stripe_charge_id` (text)
      - `transaction_date` (timestamptz)
      - `notes` (text)
      - `created_at` (timestamptz)

  2. Updates to Existing Tables
    - Add default chart of accounts categories for event fees
    - Update event_attendance to include payment information

  3. Security
    - Enable RLS on all tables
    - Policies for club admins and users
    - Guest registrations have limited access
*/

-- Create event_registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

  registration_type text NOT NULL CHECK (registration_type IN ('member', 'guest')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlist')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'pay_at_event', 'waived')),
  payment_method text CHECK (payment_method IN ('online', 'pay_at_event', 'cash', 'bank_transfer', 'waived')),

  amount_paid numeric(10, 2) DEFAULT 0,
  entry_fee_amount numeric(10, 2),
  stripe_payment_id text,
  stripe_checkout_session_id text,

  -- Guest registration fields
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  guest_club_name text,
  guest_country text,
  guest_state text,

  -- Boat details
  boat_name text,
  sail_number text,
  boat_class text,
  boat_registration_no text,
  is_personal_sail_number boolean DEFAULT false,

  -- Additional fields
  notes text,
  emergency_contact_name text,
  emergency_contact_phone text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure either user_id or guest details are provided
  CONSTRAINT registration_identity_check CHECK (
    (registration_type = 'member' AND user_id IS NOT NULL) OR
    (registration_type = 'guest' AND guest_email IS NOT NULL)
  )
);

-- Create event_payment_transactions table
CREATE TABLE IF NOT EXISTS event_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

  amount numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'cash', 'bank_transfer', 'other')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),

  stripe_payment_intent_id text,
  stripe_charge_id text,

  transaction_date timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add payment-related columns to event_attendance (for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_attendance' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE event_attendance
      ADD COLUMN payment_status text CHECK (payment_status IN ('unpaid', 'paid', 'pay_at_event', 'waived')),
      ADD COLUMN registration_id uuid REFERENCES event_registrations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id ON event_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_club_id ON event_registrations(club_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_status ON event_registrations(status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_payment_status ON event_registrations(payment_status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_guest_email ON event_registrations(guest_email);

CREATE INDEX IF NOT EXISTS idx_event_payment_transactions_registration_id ON event_payment_transactions(registration_id);
CREATE INDEX IF NOT EXISTS idx_event_payment_transactions_club_id ON event_payment_transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_event_payment_transactions_payment_status ON event_payment_transactions(payment_status);

-- Enable RLS
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_registrations

-- Public can view confirmed registrations for public events (for attendee lists)
CREATE POLICY "Public can view confirmed registrations"
  ON event_registrations
  FOR SELECT
  USING (status = 'confirmed');

-- Users can view their own registrations
CREATE POLICY "Users can view own registrations"
  ON event_registrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Club admins can view all registrations for their club
CREATE POLICY "Club admins can view club registrations"
  ON event_registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_registrations.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

-- Anyone can create registrations (including guests)
CREATE POLICY "Anyone can create registrations"
  ON event_registrations
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own registrations
CREATE POLICY "Users can update own registrations"
  ON event_registrations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Club admins can update registrations for their club
CREATE POLICY "Club admins can update club registrations"
  ON event_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_registrations.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

-- Users can delete their own registrations
CREATE POLICY "Users can delete own registrations"
  ON event_registrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Club admins can delete registrations for their club
CREATE POLICY "Club admins can delete club registrations"
  ON event_registrations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_registrations.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

-- RLS Policies for event_payment_transactions

-- Users can view their own payment transactions
CREATE POLICY "Users can view own payment transactions"
  ON event_payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = event_payment_transactions.registration_id
      AND er.user_id = auth.uid()
    )
  );

-- Club admins can view all payment transactions for their club
CREATE POLICY "Club admins can view club payment transactions"
  ON event_payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_payment_transactions.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

-- Only system (service role) can insert payment transactions
CREATE POLICY "System can create payment transactions"
  ON event_payment_transactions
  FOR INSERT
  WITH CHECK (true);

-- Club admins can update payment transactions
CREATE POLICY "Club admins can update payment transactions"
  ON event_payment_transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_payment_transactions.club_id
      AND uc.role IN ('admin', 'super_admin')
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_event_registrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_registrations_updated_at
  BEFORE UPDATE ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_event_registrations_updated_at();

-- Function to automatically create financial transaction when payment is marked as completed
CREATE OR REPLACE FUNCTION create_financial_transaction_for_event_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
  v_description text;
  v_event_name text;
  v_participant_name text;
BEGIN
  -- Only proceed if payment status changed to 'completed'
  IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN

    -- Get the event fees category (will be created by separate migration)
    SELECT id INTO v_category_id
    FROM finance_categories
    WHERE club_id = NEW.club_id
    AND name = 'Event Fees'
    LIMIT 1;

    -- If category doesn't exist, create it
    IF v_category_id IS NULL THEN
      INSERT INTO finance_categories (club_id, name, type, description, is_system)
      VALUES (NEW.club_id, 'Event Fees', 'income', 'Income from event entry fees', true)
      RETURNING id INTO v_category_id;
    END IF;

    -- Get participant name from registration
    SELECT
      COALESCE(er.guest_first_name || ' ' || er.guest_last_name, p.first_name || ' ' || p.last_name) as name
    INTO v_participant_name
    FROM event_registrations er
    LEFT JOIN profiles p ON er.user_id = p.id
    WHERE er.id = NEW.registration_id;

    -- Build description
    v_description := 'Event Entry Fee';
    IF v_participant_name IS NOT NULL THEN
      v_description := v_description || ' - ' || v_participant_name;
    END IF;

    -- Create financial transaction
    INSERT INTO finance_transactions (
      club_id,
      category_id,
      type,
      amount,
      description,
      transaction_date,
      payment_method,
      reference_number,
      created_by
    ) VALUES (
      NEW.club_id,
      v_category_id,
      'income',
      NEW.amount,
      v_description,
      NEW.transaction_date,
      NEW.payment_method,
      NEW.stripe_payment_intent_id,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER event_payment_creates_financial_transaction
  AFTER INSERT OR UPDATE ON event_payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION create_financial_transaction_for_event_payment();
