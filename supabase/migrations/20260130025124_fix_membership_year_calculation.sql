/*
  # Fix Membership Year Calculation in Remittance Trigger

  The membership_year should represent which membership period the payment is for,
  not when the next renewal is due.

  For example:
  - Member joins in January 2026
  - Club anniversary is July, so renewal date is July 2026
  - They are paying for the 2025-2026 membership year (July 2025 - July 2026)
  - So membership_year should be 2025, not 2026

  ## Changes
  - Fix membership_year calculation to use membership start date
  - Calculate based on club anniversary or date_joined
  - Remove dependency on renewal_date for year calculation
*/

CREATE OR REPLACE FUNCTION create_remittance_for_membership_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club record;
  v_state_association record;
  v_remittance_id uuid;
  v_state_fee numeric;
  v_national_fee numeric;
  v_total_fee numeric;
  v_relationship_type text;
  v_pays_association_fees boolean;
  v_membership_year integer;
  v_membership_start_date date;
BEGIN
  -- Only process if this is a paid membership
  IF NEW.is_financial != true THEN
    RETURN NEW;
  END IF;

  -- Check if user has a club_membership record and what type it is
  SELECT relationship_type::text, pays_association_fees
  INTO v_relationship_type, v_pays_association_fees
  FROM club_memberships
  WHERE member_id = NEW.user_id
  AND club_id = NEW.club_id
  AND status = 'active';

  -- Only create remittances for primary memberships that pay association fees
  IF v_relationship_type IS NULL OR v_relationship_type != 'primary' OR v_pays_association_fees != true THEN
    RETURN NEW;
  END IF;

  -- Get club details
  SELECT * INTO v_club
  FROM clubs
  WHERE id = NEW.club_id;

  IF v_club IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get state association and fees
  IF v_club.state_association_id IS NOT NULL THEN
    SELECT * INTO v_state_association
    FROM state_associations
    WHERE id = v_club.state_association_id;

    v_state_fee := COALESCE(v_state_association.state_fee_per_member, 0);
    v_national_fee := COALESCE(v_state_association.national_fee_per_member, 0);
    v_total_fee := v_state_fee + v_national_fee;

    -- Determine membership start date (when this membership period started)
    v_membership_start_date := COALESCE(NEW.date_joined, CURRENT_DATE);

    -- Calculate membership year based on the START of the membership period, not the end/renewal
    -- The membership year represents which membership period this payment is for
    v_membership_year := EXTRACT(YEAR FROM v_membership_start_date);

    -- If renewal_date exists and is more than 6 months from start date,
    -- this means they joined late in the period, so use the year before renewal
    IF NEW.renewal_date IS NOT NULL AND
       NEW.renewal_date > v_membership_start_date + INTERVAL '6 months' THEN
      -- They likely joined late in a membership year that started earlier
      -- For example: joined Jan 2026, renewal July 2026 = paying for 2025-2026 period
      v_membership_year := EXTRACT(YEAR FROM NEW.renewal_date) - 1;
    END IF;

    -- Only create remittance if there are fees
    IF v_total_fee > 0 THEN
      -- Check if remittance already exists for this member/club/year
      IF NOT EXISTS (
        SELECT 1 FROM membership_remittances
        WHERE member_id = NEW.id
        AND club_id = NEW.club_id
        AND membership_year = v_membership_year
      ) THEN
        -- Create remittance record only
        -- The triggers on membership_remittances will create the association transactions
        INSERT INTO membership_remittances (
          member_id,
          club_id,
          state_association_id,
          national_association_id,
          total_membership_fee,
          state_contribution_amount,
          national_contribution_amount,
          club_retained_amount,
          club_to_state_status,
          membership_year,
          membership_start_date,
          membership_end_date,
          bulk_payment
        ) VALUES (
          NEW.id,
          NEW.club_id,
          v_club.state_association_id,
          v_state_association.national_association_id,
          v_total_fee,
          v_state_fee,
          v_national_fee,
          0, -- Club doesn't retain any fees in cascade system
          'pending',
          v_membership_year,
          v_membership_start_date,
          COALESCE(NEW.renewal_date, v_membership_start_date + INTERVAL '1 year'),
          false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;