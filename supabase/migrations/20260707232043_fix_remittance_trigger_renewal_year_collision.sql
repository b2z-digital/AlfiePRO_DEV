-- Fix create_remittance_for_membership_v2 so a renewal into a new membership
-- cycle creates a remittance for a new (free) membership year instead of
-- silently colliding with an already-paid prior-year remittance.
--
-- Previous behaviour: membership_year was computed as EXTRACT(YEAR FROM renewal_date) - 1
-- and inserted with ON CONFLICT DO UPDATE gated to club_to_state_status = 'pending'.
-- When that computed year already had a PAID remittance, nothing happened and no
-- remittance was created for the renewed cycle (e.g. a 2027 renewal collided with a
-- paid 2026 row). This mirrors the corrected free-year loop used by
-- ensure_renewal_financials().

CREATE OR REPLACE FUNCTION public.create_remittance_for_membership_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_cycle_end date;
  v_has_current_remit boolean;
BEGIN
  IF NEW.is_financial != true THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.membership_status, 'active') IN ('archived', 'cancelled') THEN
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

  SELECT * INTO v_club FROM clubs WHERE id = NEW.club_id;
  IF v_club IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_club.state_association_id IS NULL THEN
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

  -- Base membership year, then advance past any years already remitted.
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
$function$;