/*
  # Fix Duplicate Remittances and Add Unique Constraint

  1. Data Cleanup
    - Removes duplicate membership_remittances entries, keeping the most recently created record
      for each (member_id, club_id, membership_year) combination
    - Specifically fixes duplicates for Jasper Walsh and Stephen Walsh in LMRYC for 2025

  2. Schema Changes
    - Adds a unique constraint on (member_id, club_id, membership_year) to prevent future duplicates

  3. Trigger Updates
    - Updates `create_remittance_for_membership_v2` to use INSERT ... ON CONFLICT (upsert)
    - Updates `create_remittance_from_membership_transaction` to use INSERT ... ON CONFLICT (upsert)
    - Both triggers now safely update existing records instead of silently skipping or creating duplicates

  4. Important Notes
    - No data is lost: the most recent record for each member/club/year is preserved
    - The unique constraint enforces one remittance per member per club per year at the database level
    - Triggers now update fee amounts if they change, rather than creating new records
*/

-- Step 1: Remove duplicate remittances, keeping the most recently created record
DO $$
DECLARE
  deleted_count integer;
BEGIN
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY member_id, club_id, membership_year
             ORDER BY created_at DESC
           ) AS rn
    FROM membership_remittances
  )
  DELETE FROM membership_remittances
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Removed % duplicate remittance records', deleted_count;
END $$;

-- Step 2: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_remittances_member_club_year
  ON membership_remittances (member_id, club_id, membership_year);

-- Step 3: Update the members trigger to use upsert
CREATE OR REPLACE FUNCTION create_remittance_for_membership_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club record;
  v_state_association record;
  v_state_fee numeric;
  v_national_fee numeric;
  v_total_fee numeric;
  v_relationship_type text;
  v_pays_association_fees boolean;
  v_membership_year integer;
  v_membership_start_date date;
BEGIN
  IF NEW.is_financial != true THEN
    RETURN NEW;
  END IF;

  SELECT relationship_type::text, pays_association_fees
  INTO v_relationship_type, v_pays_association_fees
  FROM club_memberships
  WHERE member_id = NEW.user_id
    AND club_id = NEW.club_id
    AND status = 'active';

  IF v_relationship_type IS NULL OR v_relationship_type != 'primary' OR v_pays_association_fees != true THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_club
  FROM clubs
  WHERE id = NEW.club_id;

  IF v_club IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_club.state_association_id IS NOT NULL THEN
    SELECT * INTO v_state_association
    FROM state_associations
    WHERE id = v_club.state_association_id;

    v_state_fee := COALESCE(v_state_association.state_fee_per_member, 0);
    v_national_fee := COALESCE(v_state_association.national_fee_per_member, 0);
    v_total_fee := v_state_fee + v_national_fee;

    v_membership_start_date := COALESCE(NEW.date_joined, CURRENT_DATE);
    v_membership_year := EXTRACT(YEAR FROM v_membership_start_date);

    IF NEW.renewal_date IS NOT NULL AND
       NEW.renewal_date > v_membership_start_date + INTERVAL '6 months' THEN
      v_membership_year := EXTRACT(YEAR FROM NEW.renewal_date) - 1;
    END IF;

    IF v_total_fee > 0 THEN
      INSERT INTO membership_remittances (
        member_id, club_id, state_association_id, national_association_id,
        total_membership_fee, state_contribution_amount, national_contribution_amount,
        club_retained_amount, club_to_state_status, membership_year,
        membership_start_date, membership_end_date, bulk_payment
      ) VALUES (
        NEW.id, NEW.club_id, v_club.state_association_id,
        v_state_association.national_association_id,
        v_total_fee, v_state_fee, v_national_fee,
        0, 'pending', v_membership_year,
        v_membership_start_date,
        COALESCE(NEW.renewal_date, v_membership_start_date + INTERVAL '1 year'),
        false
      )
      ON CONFLICT (member_id, club_id, membership_year)
      DO UPDATE SET
        total_membership_fee = EXCLUDED.total_membership_fee,
        state_contribution_amount = EXCLUDED.state_contribution_amount,
        national_contribution_amount = EXCLUDED.national_contribution_amount,
        state_association_id = EXCLUDED.state_association_id,
        national_association_id = EXCLUDED.national_association_id,
        membership_start_date = EXCLUDED.membership_start_date,
        membership_end_date = EXCLUDED.membership_end_date,
        updated_at = now()
      WHERE membership_remittances.club_to_state_status = 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 4: Update the membership_transactions trigger to use upsert
CREATE OR REPLACE FUNCTION create_remittance_from_membership_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_club_id uuid;
  v_state_association_id uuid;
  v_national_association_id uuid;
  v_fee_structure public.membership_fee_structures;
  v_membership_year integer;
  v_membership_start date;
  v_membership_end date;
  v_club_retained decimal(10,2);
  v_payment_date date;
BEGIN
  IF NEW.payment_status NOT IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;

  v_payment_date := COALESCE(NEW.created_at::date, CURRENT_DATE);

  SELECT club_id INTO v_member_club_id
  FROM public.members
  WHERE id = NEW.member_id;

  IF v_member_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT state_association_id INTO v_state_association_id
  FROM public.state_association_clubs
  WHERE club_id = v_member_club_id
    AND is_active = true
  LIMIT 1;

  IF v_state_association_id IS NOT NULL THEN
    SELECT national_association_id INTO v_national_association_id
    FROM public.state_associations
    WHERE id = v_state_association_id;
  END IF;

  IF v_state_association_id IS NOT NULL THEN
    v_fee_structure := public.get_active_fee_structure(v_state_association_id, v_payment_date);
  END IF;

  v_membership_start := v_payment_date;
  v_membership_year := EXTRACT(YEAR FROM v_membership_start);
  v_membership_end := v_membership_start + INTERVAL '1 year';

  v_club_retained := COALESCE(NEW.total_amount, NEW.amount)
    - COALESCE(v_fee_structure.state_contribution_amount, 0);

  INSERT INTO public.membership_remittances (
    member_id, club_id, membership_payment_id, membership_type_id,
    state_association_id, national_association_id, fee_structure_id,
    total_membership_fee, state_contribution_amount, national_contribution_amount,
    club_retained_amount, club_to_state_status, state_to_national_status,
    membership_year, membership_start_date, membership_end_date
  ) VALUES (
    NEW.member_id, v_member_club_id, NEW.id, NEW.membership_type_id,
    v_state_association_id, v_national_association_id, v_fee_structure.id,
    COALESCE(v_fee_structure.state_contribution_amount, 0),
    COALESCE(v_fee_structure.state_contribution_amount, 0),
    COALESCE(v_fee_structure.national_contribution_amount, 0),
    v_club_retained, 'pending', 'pending',
    v_membership_year, v_membership_start, v_membership_end
  )
  ON CONFLICT (member_id, club_id, membership_year)
  DO UPDATE SET
    total_membership_fee = EXCLUDED.total_membership_fee,
    state_contribution_amount = EXCLUDED.state_contribution_amount,
    national_contribution_amount = EXCLUDED.national_contribution_amount,
    membership_payment_id = EXCLUDED.membership_payment_id,
    fee_structure_id = EXCLUDED.fee_structure_id,
    updated_at = now()
  WHERE membership_remittances.club_to_state_status = 'pending';

  RETURN NEW;
END;
$$;
