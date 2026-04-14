/*
  # Fix Remittance Trigger for Admin-Added Members

  1. Problem
    - When an admin adds a member manually, the member has user_id = NULL
    - The remittance trigger looks up club_memberships WHERE member_id = NEW.user_id
    - Since user_id is NULL, this always fails and no remittance is created
    - Admin-added members never get remittance records for state/national fees

  2. Fix
    - Update the trigger to first try matching via user_id (for linked members)
    - If no match found (admin-added / unlinked members), treat them as primary 
      members by default since they're the only member in that club
    - This ensures all financial members get proper remittance records regardless
      of whether they have an account linked

  3. Tables Affected
    - membership_remittances (records will now be created for admin-added members)
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

  v_relationship_type := NULL;
  v_pays_association_fees := NULL;

  IF NEW.user_id IS NOT NULL THEN
    SELECT relationship_type::text, pays_association_fees
    INTO v_relationship_type, v_pays_association_fees
    FROM club_memberships
    WHERE member_id = NEW.user_id
    AND club_id = NEW.club_id
    AND status = 'active';
  END IF;

  IF v_relationship_type IS NOT NULL THEN
    IF v_relationship_type != 'primary' OR v_pays_association_fees != true THEN
      RETURN NEW;
    END IF;
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