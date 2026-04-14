/*
  # Fix remittance trigger to skip archived/cancelled members

  1. Changes
    - Drop and recreate the remittance trigger on `members` table
    - Add condition to WHEN clause: `membership_status` must NOT be 'archived' or 'cancelled'
    - Update the trigger function to also check membership_status inside the function body as a safety net
  
  2. Impact
    - Archiving or deleting a member will no longer create spurious remittance records
    - Only active, financial members will generate remittances
  
  3. Cleanup
    - Remove any orphaned remittances for currently archived members
*/

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trigger_create_remittance_for_membership ON public.members;

-- Recreate with updated WHEN clause that excludes archived and cancelled members
CREATE TRIGGER trigger_create_remittance_for_membership
  AFTER INSERT OR UPDATE ON public.members
  FOR EACH ROW
  WHEN (
    NEW.is_financial = true 
    AND COALESCE(NEW.membership_status, 'active') NOT IN ('archived', 'cancelled')
  )
  EXECUTE FUNCTION create_remittance_for_membership_v2();

-- Also update the function to add a safety check inside the body
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

-- Clean up any orphaned remittances for archived members
DELETE FROM remittance_reconciliations
WHERE membership_remittance_id IN (
  SELECT mr.id FROM membership_remittances mr
  JOIN members m ON m.id = mr.member_id
  WHERE m.membership_status = 'archived'
);

DELETE FROM remittance_payment_allocations
WHERE remittance_id IN (
  SELECT mr.id FROM membership_remittances mr
  JOIN members m ON m.id = mr.member_id
  WHERE m.membership_status = 'archived'
);

DELETE FROM membership_remittances
WHERE member_id IN (
  SELECT id FROM members WHERE membership_status = 'archived'
);