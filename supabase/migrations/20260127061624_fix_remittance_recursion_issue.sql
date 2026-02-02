/*
  # Fix Remittance Trigger Recursion Issue
  
  The trigger was creating association_transactions directly AND the membership_remittances
  table has triggers that also create association_transactions, causing infinite recursion.
  
  1. Changes
    - Remove direct creation of association_transactions from the function
    - Let the triggers on membership_remittances handle that
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

    -- Calculate membership year
    v_membership_year := EXTRACT(YEAR FROM COALESCE(NEW.renewal_date, NEW.date_joined, CURRENT_DATE));

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
          COALESCE(NEW.date_joined, CURRENT_DATE),
          COALESCE(NEW.renewal_date, CURRENT_DATE + INTERVAL '1 year'),
          false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;