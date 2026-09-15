/*
# Fix remittance trigger to handle members without an auth account

## Problem
Members manually added to a club (i.e. not linked to an auth account) have user_id = NULL.
The sync_member_to_club_membership trigger bails out early when user_id is NULL,
so no club_memberships record is created. The remittance trigger then also bails
out because it depends on club_memberships. This means manually-added members
never get remittance entries even if they have a full membership type set.

## Changes
- Updates create_remittance_for_membership_v2 to fall back to matching the member's
  membership_level text against membership_types.name when no club_memberships record
  exists. This allows remittance creation for members without auth accounts.

## Notes
- Only affects members where user_id IS NULL and membership_level matches an active
  membership type with requires_association_fees = true.
- Existing members with club_memberships records are unaffected.
*/

CREATE OR REPLACE FUNCTION create_remittance_for_membership_v2()
RETURNS trigger AS $$
DECLARE
  v_club record;
  v_state_association record;
  v_state_fee numeric;
  v_national_fee numeric;
  v_total_fee numeric;
  v_cm record;
  v_requires_assoc_fees boolean;
  v_membership_year integer;
  v_membership_start_date date;
  v_cycle_end date;
  v_has_current_remit boolean;
  v_mt_id uuid;
BEGIN
  -- Only proceed for financial, non-archived members
  IF NEW.is_financial != true THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.membership_status, 'active') IN ('archived', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Look up the club_memberships record for this member + club.
  v_cm := NULL;
  IF NEW.user_id IS NOT NULL THEN
    SELECT relationship_type::text, pays_association_fees, membership_type_id
    INTO v_cm
    FROM club_memberships
    WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id
      AND status = 'active';
  END IF;

  IF v_cm IS NOT NULL THEN
    -- Existing club_memberships path (unchanged)
    IF v_cm.relationship_type IS NOT NULL AND v_cm.relationship_type != 'primary' THEN
      RETURN NEW;
    END IF;

    IF v_cm.pays_association_fees IS NOT NULL AND v_cm.pays_association_fees != true THEN
      RETURN NEW;
    END IF;

    v_requires_assoc_fees := false;
    IF v_cm.membership_type_id IS NOT NULL THEN
      SELECT COALESCE(mt.requires_association_fees, false)
      INTO v_requires_assoc_fees
      FROM membership_types mt
      WHERE mt.id = v_cm.membership_type_id;
    END IF;

    IF v_requires_assoc_fees != true THEN
      RETURN NEW;
    END IF;
  ELSE
    -- No club_memberships record (e.g. manually added member with no auth account).
    -- Fall back: match membership_level text to a membership_types record.
    IF NEW.membership_level IS NULL OR NEW.membership_level = '' THEN
      RETURN NEW;
    END IF;

    SELECT mt.id, COALESCE(mt.requires_association_fees, false)
    INTO v_mt_id, v_requires_assoc_fees
    FROM membership_types mt
    WHERE mt.club_id = NEW.club_id
      AND mt.name = NEW.membership_level
      AND mt.is_active = true
    LIMIT 1;

    IF v_mt_id IS NULL OR v_requires_assoc_fees != true THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Fetch the club and verify it belongs to a state association
  SELECT * INTO v_club FROM clubs WHERE id = NEW.club_id;
  IF v_club IS NULL OR v_club.state_association_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_state_association
  FROM state_associations
  WHERE id = v_club.state_association_id;

  v_state_fee := COALESCE(v_state_association.state_fee_per_member, 0);
  v_national_fee := COALESCE(v_state_association.national_fee_per_member, 0);
  v_total_fee := v_state_fee + v_national_fee;

  IF v_total_fee <= 0 THEN
    RETURN NEW;
  END IF;

  v_membership_start_date := COALESCE(NEW.date_joined, CURRENT_DATE);

  IF NEW.renewal_date IS NOT NULL THEN
    v_cycle_end := NEW.renewal_date;
  ELSE
    v_cycle_end := (v_membership_start_date + INTERVAL '1 year')::date;
  END IF;

  -- If a remittance already covers the current membership cycle, do nothing.
  SELECT EXISTS (
    SELECT 1 FROM membership_remittances
    WHERE member_id = NEW.id
      AND club_id = NEW.club_id
      AND membership_end_date >= v_cycle_end
  ) INTO v_has_current_remit;

  IF v_has_current_remit THEN
    RETURN NEW;
  END IF;

  -- Determine membership year
  v_membership_year := EXTRACT(YEAR FROM v_membership_start_date)::int;
  IF NEW.renewal_date IS NOT NULL
     AND NEW.renewal_date > v_membership_start_date + INTERVAL '6 months' THEN
    v_membership_year := EXTRACT(YEAR FROM NEW.renewal_date)::int - 1;
  END IF;

  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM membership_remittances
      WHERE member_id = NEW.id
        AND club_id = NEW.club_id
        AND membership_year = v_membership_year
    ) THEN
      EXIT;
    END IF;
    v_membership_year := v_membership_year + 1;
  END LOOP;

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
    (v_cycle_end - INTERVAL '1 year')::date,
    v_cycle_end,
    false
  )
  ON CONFLICT (member_id, club_id, membership_year) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
