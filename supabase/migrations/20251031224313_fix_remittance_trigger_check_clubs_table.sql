/*
  # Fix Remittance Trigger to Check clubs.state_association_id

  The trigger was only checking state_association_clubs junction table,
  but the state association is stored directly in clubs.state_association_id.
  
  This updates the trigger to check clubs table first, then fall back to junction table.
*/

CREATE OR REPLACE FUNCTION public.create_remittance_from_membership_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
  -- Only process if payment status is 'paid' or 'completed'
  IF NEW.payment_status NOT IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Use created_at date as payment date if not specified
  v_payment_date := COALESCE(NEW.created_at::date, CURRENT_DATE);

  -- Get member's club
  SELECT club_id INTO v_member_club_id
  FROM public.members
  WHERE id = NEW.member_id;

  IF v_member_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get state association for this club (check clubs table first)
  SELECT state_association_id INTO v_state_association_id
  FROM public.clubs
  WHERE id = v_member_club_id;

  -- If not found in clubs table, check junction table
  IF v_state_association_id IS NULL THEN
    SELECT state_association_id INTO v_state_association_id
    FROM public.state_association_clubs
    WHERE club_id = v_member_club_id
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Get national association for the state
  IF v_state_association_id IS NOT NULL THEN
    SELECT national_association_id INTO v_national_association_id
    FROM public.state_associations
    WHERE id = v_state_association_id;
  END IF;

  -- Get active fee structure
  IF v_state_association_id IS NOT NULL THEN
    v_fee_structure := public.get_active_fee_structure(v_state_association_id, v_payment_date);
  END IF;

  -- Calculate membership year and dates
  v_membership_start := v_payment_date;
  v_membership_year := EXTRACT(YEAR FROM v_membership_start);
  v_membership_end := v_membership_start + INTERVAL '1 year';

  -- Calculate club retained amount (use total_amount or amount)
  v_club_retained := COALESCE(NEW.total_amount, NEW.amount)
    - COALESCE(v_fee_structure.state_contribution_amount, 0)
    - COALESCE(v_fee_structure.national_contribution_amount, 0);

  -- Check if remittance already exists for this member and year
  IF NOT EXISTS (
    SELECT 1 FROM public.membership_remittances
    WHERE member_id = NEW.member_id
      AND membership_year = v_membership_year
  ) THEN
    -- Create remittance record
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
      COALESCE(NEW.total_amount, NEW.amount),
      COALESCE(v_fee_structure.state_contribution_amount, 0),
      COALESCE(v_fee_structure.national_contribution_amount, 0),
      v_club_retained,
      'pending',
      'pending',
      v_membership_year,
      v_membership_start,
      v_membership_end
    );
  END IF;

  RETURN NEW;
END;
$$;
