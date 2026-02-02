/*
  # Backfill Remittances for Existing Financial Members

  Creates remittance records for existing financial members who don't have them yet.
  This is needed because members added before the remittance system was implemented
  won't have remittance records.

  For each financial member:
  - Gets their club's state association
  - Gets the active fee structure
  - Creates a remittance record with pending status
*/

DO $$
DECLARE
  member_record RECORD;
  v_state_association_id uuid;
  v_national_association_id uuid;
  v_fee_structure public.membership_fee_structures;
  v_membership_year integer;
  v_club_retained decimal(10,2);
  v_total_fee decimal(10,2);
BEGIN
  -- Get current year
  v_membership_year := EXTRACT(YEAR FROM CURRENT_DATE);

  -- Loop through all financial members who don't have remittances for current year
  FOR member_record IN
    SELECT
      m.id as member_id,
      m.club_id,
      m.first_name,
      m.last_name,
      m.date_joined
    FROM public.members m
    WHERE m.is_financial = true
      AND m.membership_status != 'archived'
      AND NOT EXISTS (
        SELECT 1 FROM public.membership_remittances mr
        WHERE mr.member_id = m.id
          AND mr.membership_year = v_membership_year
      )
  LOOP
    -- Reset variables for each member
    v_state_association_id := NULL;
    v_national_association_id := NULL;
    v_fee_structure := NULL;
    v_total_fee := 15.00; -- Default membership fee, adjust if needed

    -- Get state association for this member's club
    SELECT state_association_id INTO v_state_association_id
    FROM public.state_association_clubs
    WHERE club_id = member_record.club_id
      AND is_active = true
    LIMIT 1;

    -- Skip if no state association (club not linked to any state)
    IF v_state_association_id IS NULL THEN
      RAISE NOTICE 'Skipping member % % - club not linked to state association',
        member_record.first_name, member_record.last_name;
      CONTINUE;
    END IF;

    -- Get national association for the state
    SELECT national_association_id INTO v_national_association_id
    FROM public.state_associations
    WHERE id = v_state_association_id;

    -- Get active fee structure
    v_fee_structure := public.get_active_fee_structure(v_state_association_id, CURRENT_DATE);

    -- Calculate club retained amount
    IF v_fee_structure IS NOT NULL THEN
      v_club_retained := v_total_fee
        - COALESCE(v_fee_structure.state_contribution_amount, 0)
        - COALESCE(v_fee_structure.national_contribution_amount, 0);
    ELSE
      -- If no fee structure, club retains everything
      v_club_retained := v_total_fee;
    END IF;

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
      member_record.member_id,
      member_record.club_id,
      NULL, -- No payment transaction for existing members
      NULL, -- No membership type for existing members
      v_state_association_id,
      v_national_association_id,
      v_fee_structure.id,
      v_total_fee,
      COALESCE(v_fee_structure.state_contribution_amount, 0),
      COALESCE(v_fee_structure.national_contribution_amount, 0),
      v_club_retained,
      'pending',
      'pending',
      v_membership_year,
      COALESCE(member_record.date_joined::date, CURRENT_DATE),
      COALESCE(member_record.date_joined::date, CURRENT_DATE) + INTERVAL '1 year'
    );

    RAISE NOTICE 'Created remittance for member: % %',
      member_record.first_name, member_record.last_name;

  END LOOP;

  RAISE NOTICE 'Backfill complete!';
END $$;
