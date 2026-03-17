/*
  # Mid-Cycle State Fee Credit System

  When a member joins or rejoins mid-cycle (between 1 July and 30 June), their state association
  fee is paid at that time. When they renew at the start of the next membership cycle (1 July),
  that state fee should be credited/deducted from their renewal fee.

  This implements the NSW State Association rule where mid-cycle joiners get a state fee credit
  on their next renewal.

  1. New Tables
    - `mid_cycle_state_fee_credits`
      - `id` (uuid, primary key)
      - `member_id` (uuid, references members)
      - `club_id` (uuid, references clubs)
      - `state_association_id` (uuid, references state_associations)
      - `source_remittance_id` (uuid, references membership_remittances) - the remittance that paid the state fee mid-cycle
      - `credit_amount` (numeric) - the state fee amount to credit
      - `membership_year_paid` (integer) - the year the state fee was paid mid-cycle
      - `membership_year_credit` (integer) - the year the credit should be applied
      - `status` (text) - pending, applied, expired
      - `applied_remittance_id` (uuid) - the remittance where the credit was applied
      - `applied_at` (timestamptz)
      - `notes` (text)
      - `created_at` (timestamptz)

  2. New Function
    - `check_mid_cycle_state_fee_credit` - called during renewal to check if member has a credit

  3. Security
    - Enable RLS on `mid_cycle_state_fee_credits` table
    - Policies for club admins and state admins to view/manage credits
*/

-- Create mid-cycle state fee credits table
CREATE TABLE IF NOT EXISTS mid_cycle_state_fee_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id uuid NOT NULL REFERENCES state_associations(id) ON DELETE CASCADE,
  source_remittance_id uuid REFERENCES membership_remittances(id) ON DELETE SET NULL,
  credit_amount numeric(10,2) NOT NULL DEFAULT 0,
  membership_year_paid integer NOT NULL,
  membership_year_credit integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'expired')),
  applied_remittance_id uuid REFERENCES membership_remittances(id) ON DELETE SET NULL,
  applied_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_mid_cycle_credits_member ON mid_cycle_state_fee_credits(member_id);
CREATE INDEX IF NOT EXISTS idx_mid_cycle_credits_club ON mid_cycle_state_fee_credits(club_id);
CREATE INDEX IF NOT EXISTS idx_mid_cycle_credits_state ON mid_cycle_state_fee_credits(state_association_id);
CREATE INDEX IF NOT EXISTS idx_mid_cycle_credits_status ON mid_cycle_state_fee_credits(status);
CREATE INDEX IF NOT EXISTS idx_mid_cycle_credits_year ON mid_cycle_state_fee_credits(membership_year_credit);

-- Unique constraint: one credit per member per club per credit year
CREATE UNIQUE INDEX IF NOT EXISTS idx_mid_cycle_credits_unique 
  ON mid_cycle_state_fee_credits(member_id, club_id, membership_year_credit) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE mid_cycle_state_fee_credits ENABLE ROW LEVEL SECURITY;

-- Club admins can view credits for their club
CREATE POLICY "Club admins can view mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = mid_cycle_state_fee_credits.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Club admins can insert credits for their club
CREATE POLICY "Club admins can create mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = mid_cycle_state_fee_credits.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Club admins can update credits for their club
CREATE POLICY "Club admins can update mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = mid_cycle_state_fee_credits.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = mid_cycle_state_fee_credits.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- State admins can view credits for their state
CREATE POLICY "State admins can view mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'state_admin'
    )
  );

-- State admins can update credits
CREATE POLICY "State admins can update mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'state_admin'
    )
  );

-- Super admins can do everything
CREATE POLICY "Super admins can manage mid-cycle credits"
  ON mid_cycle_state_fee_credits
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    )
  );

-- Function to automatically create a mid-cycle credit when a member joins/rejoins mid-cycle
-- The membership cycle runs from 1 July to 30 June
-- If a member joins between 1 July and 30 June, they pay the state fee
-- On renewal (next 1 July), that state fee is credited
CREATE OR REPLACE FUNCTION auto_create_mid_cycle_state_fee_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_join_date date;
  v_cycle_start date;
  v_cycle_end date;
  v_current_year integer;
  v_credit_year integer;
  v_state_fee numeric;
  v_state_association_id uuid;
BEGIN
  -- Only process when a remittance is created with a state contribution
  IF NEW.state_contribution_amount IS NULL OR NEW.state_contribution_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Only process if there is a state association
  IF NEW.state_association_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_join_date := NEW.membership_start_date;
  
  -- Determine the current membership cycle
  -- Cycle runs 1 July to 30 June
  -- If join date is between 1 July and 31 December, cycle year = that year
  -- If join date is between 1 January and 30 June, cycle year = previous year
  IF EXTRACT(MONTH FROM v_join_date) >= 7 THEN
    v_current_year := EXTRACT(YEAR FROM v_join_date)::integer;
  ELSE
    v_current_year := (EXTRACT(YEAR FROM v_join_date) - 1)::integer;
  END IF;

  v_cycle_start := make_date(v_current_year, 7, 1);
  v_cycle_end := make_date(v_current_year + 1, 6, 30);
  v_credit_year := v_current_year + 1;

  -- Check if this is a mid-cycle join (not joining on exactly 1 July)
  IF v_join_date > v_cycle_start THEN
    -- This is a mid-cycle join/rejoin - create a credit for the next cycle
    INSERT INTO mid_cycle_state_fee_credits (
      member_id,
      club_id,
      state_association_id,
      source_remittance_id,
      credit_amount,
      membership_year_paid,
      membership_year_credit,
      status,
      notes
    ) VALUES (
      NEW.member_id,
      NEW.club_id,
      NEW.state_association_id,
      NEW.id,
      NEW.state_contribution_amount,
      v_current_year,
      v_credit_year,
      'pending',
      'State fee paid mid-cycle (joined ' || to_char(v_join_date, 'DD Mon YYYY') || '). Credit applies to ' || v_credit_year || '/' || (v_credit_year + 1) || ' renewal.'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on membership_remittances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_mid_cycle_credit'
  ) THEN
    CREATE TRIGGER trigger_auto_mid_cycle_credit
      AFTER INSERT ON membership_remittances
      FOR EACH ROW
      EXECUTE FUNCTION auto_create_mid_cycle_state_fee_credit();
  END IF;
END $$;

-- Function to check and retrieve pending mid-cycle credits for a member
-- Called during renewal to determine if a credit should be applied
CREATE OR REPLACE FUNCTION get_pending_mid_cycle_credit(
  p_member_id uuid,
  p_club_id uuid,
  p_renewal_year integer
)
RETURNS TABLE (
  credit_id uuid,
  credit_amount numeric,
  membership_year_paid integer,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mcc.id,
    mcc.credit_amount,
    mcc.membership_year_paid,
    mcc.notes
  FROM mid_cycle_state_fee_credits mcc
  WHERE mcc.member_id = p_member_id
  AND mcc.club_id = p_club_id
  AND mcc.membership_year_credit = p_renewal_year
  AND mcc.status = 'pending';
END;
$$;

-- Function to apply a mid-cycle credit during renewal
CREATE OR REPLACE FUNCTION apply_mid_cycle_credit(
  p_credit_id uuid,
  p_applied_remittance_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mid_cycle_state_fee_credits
  SET 
    status = 'applied',
    applied_remittance_id = p_applied_remittance_id,
    applied_at = now(),
    updated_at = now()
  WHERE id = p_credit_id
  AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_mid_cycle_credits_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_mid_cycle_credits_updated_at'
  ) THEN
    CREATE TRIGGER trigger_update_mid_cycle_credits_updated_at
      BEFORE UPDATE ON mid_cycle_state_fee_credits
      FOR EACH ROW
      EXECUTE FUNCTION update_mid_cycle_credits_updated_at();
  END IF;
END $$;
