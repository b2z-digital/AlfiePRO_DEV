/*
  # Fix create_membership_remittance_on_payment crash

  The membership_payments table has no `payment_date` column, but this trigger
  function referenced NEW.payment_date, causing every UPDATE/INSERT that set a
  payment to 'paid'/'completed' to throw "record new has no field payment_date".
  This silently rolled back the payment completion (the renewals "Confirm Payment"
  flow), leaving payments stuck as pending and no remittance created.

  Fix:
  - Derive the membership date from CURRENT_DATE (no payment_date column exists).
  - Add ON CONFLICT (member_id, club_id, membership_year) DO NOTHING so a year
    collision with an existing remittance can never throw.
*/

CREATE OR REPLACE FUNCTION public.create_membership_remittance_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
  IF NEW.status NOT IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;

  v_payment_date := CURRENT_DATE;

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

  v_club_retained := NEW.amount
    - COALESCE(v_fee_structure.state_contribution_amount, 0)
    - COALESCE(v_fee_structure.national_contribution_amount, 0);

  INSERT INTO public.membership_remittances (
    member_id,
    club_id,
    membership_payment_id,
    membership_type_id,
    state_association_id,
    national_association_id,
    fee_structure_id,
    total_membership_fee,
    state_contribution_amount,
    national_contribution_amount,
    club_retained_amount,
    club_to_state_status,
    state_to_national_status,
    membership_year,
    membership_start_date,
    membership_end_date
  ) VALUES (
    NEW.member_id,
    v_member_club_id,
    NEW.id,
    NEW.membership_type_id,
    v_state_association_id,
    v_national_association_id,
    v_fee_structure.id,
    NEW.amount,
    COALESCE(v_fee_structure.state_contribution_amount, 0),
    COALESCE(v_fee_structure.national_contribution_amount, 0),
    v_club_retained,
    'pending',
    'pending',
    v_membership_year,
    v_membership_start,
    v_membership_end
  )
  ON CONFLICT (member_id, club_id, membership_year) DO NOTHING;

  RETURN NEW;
END;
$function$;