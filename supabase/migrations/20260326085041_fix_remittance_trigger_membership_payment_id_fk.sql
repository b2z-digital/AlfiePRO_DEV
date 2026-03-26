/*
  # Fix remittance trigger FK violation on membership_payment_id

  1. Problem
    - The `create_remittance_from_membership_transaction` trigger passes
      `NEW.id` (a membership_transactions UUID) into `membership_payment_id`
      which has a foreign key to the `membership_payments` table
    - This causes a FK violation, rolling back the entire membership_transactions insert
    - The transactions table row gets created, but membership_transactions fails silently

  2. Fix
    - Set `membership_payment_id` to NULL in the remittance insert since the payment
      is coming from membership_transactions, not membership_payments
    - The trigger should only skip the remittance insert (not fail) for clubs
      without a state association
*/

CREATE OR REPLACE FUNCTION public.create_remittance_from_membership_transaction()
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

  -- If no state association, skip remittance creation entirely
  IF v_state_association_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT national_association_id INTO v_national_association_id
  FROM public.state_associations
  WHERE id = v_state_association_id;

  v_fee_structure := public.get_active_fee_structure(v_state_association_id, v_payment_date);

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
    NEW.member_id, v_member_club_id, NULL, NEW.membership_type_id,
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
    fee_structure_id = EXCLUDED.fee_structure_id,
    updated_at = now()
  WHERE membership_remittances.club_to_state_status = 'pending';

  RETURN NEW;
END;
$$;
