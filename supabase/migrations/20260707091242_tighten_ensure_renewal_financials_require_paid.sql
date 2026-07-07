/*
  # Tighten ensure_renewal_financials: require a genuinely PAID member

  ## Problem
  The previous gate only checked `is_financial IS TRUE`. A member can be
  is_financial=true carried over from a PRIOR paid cycle while being overdue /
  renewed-into-pending (payment_status <> 'paid') for the current cycle.
  Running the helper for such members created:
    - a pending Association-fee remittance the club does not actually owe yet
    - a fabricated "paid" club income transaction for money not received

  This surfaced as clubs (e.g. LMRYC) showing overdue/un-renewed members as
  owing association fees.

  ## Fix
  Require both is_financial = true AND payment_status = 'paid'. The renewal
  "Confirm Payment" flow already sets both before calling this function, so the
  legitimate path is unaffected; only premature/overdue members are now skipped.

  ## Security
  No RLS changes. SECURITY DEFINER retained.
*/

CREATE OR REPLACE FUNCTION public.ensure_renewal_financials(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member record;
  v_club record;
  v_state record;
  v_state_fee numeric;
  v_national_fee numeric;
  v_total_fee numeric;
  v_rel text;
  v_pays boolean;
  v_start date;
  v_end date;
  v_year int;
  v_has_current_remit boolean;
  v_remit_created boolean := false;
  v_tx_created boolean := false;
  v_amount numeric;
  v_cat uuid;
  v_tax_enabled boolean;
  v_tax_rate numeric;
  v_tax numeric := 0;
  v_base numeric;
  v_total numeric;
  v_tx_id uuid;
  v_name text;
  v_has_paid_tx boolean;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND OR v_member.is_financial IS NOT TRUE
     OR v_member.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('skipped', 'not_paid_financial');
  END IF;
  IF COALESCE(v_member.membership_status, 'active') IN ('archived', 'cancelled') THEN
    RETURN jsonb_build_object('skipped', 'archived_or_cancelled');
  END IF;
  IF v_member.renewal_date IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_renewal_date');
  END IF;

  SELECT * INTO v_club FROM clubs WHERE id = v_member.club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', 'no_club');
  END IF;

  v_name := trim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, ''));
  v_end := v_member.renewal_date;
  v_start := (v_member.renewal_date - INTERVAL '1 year')::date;

  ----------------------------------------------------------------------------
  -- 1. Association-fee remittance for the current cycle
  ----------------------------------------------------------------------------
  IF v_club.state_association_id IS NOT NULL THEN
    v_rel := NULL;
    v_pays := NULL;
    IF v_member.user_id IS NOT NULL THEN
      SELECT relationship_type::text, pays_association_fees
      INTO v_rel, v_pays
      FROM club_memberships
      WHERE member_id = v_member.user_id
        AND club_id = v_member.club_id
        AND status = 'active'
      LIMIT 1;
    END IF;

    -- Skip only for non-primary members or those flagged as not paying fees
    IF v_rel IS NULL OR NOT (v_rel <> 'primary' OR v_pays = false) THEN
      SELECT * INTO v_state FROM state_associations WHERE id = v_club.state_association_id;
      v_state_fee := COALESCE(v_state.state_fee_per_member, 0);
      v_national_fee := COALESCE(v_state.national_fee_per_member, 0);
      v_total_fee := v_state_fee + v_national_fee;

      SELECT EXISTS (
        SELECT 1 FROM membership_remittances
        WHERE member_id = p_member_id
          AND club_id = v_member.club_id
          AND membership_end_date >= v_member.renewal_date
      ) INTO v_has_current_remit;

      IF v_total_fee > 0 AND NOT v_has_current_remit THEN
        v_year := EXTRACT(YEAR FROM v_end)::int - 1;
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM membership_remittances
            WHERE member_id = p_member_id
              AND club_id = v_member.club_id
              AND membership_year = v_year
          ) THEN
            EXIT;
          END IF;
          v_year := v_year + 1;
        END LOOP;

        INSERT INTO membership_remittances (
          member_id, club_id, state_association_id, national_association_id,
          total_membership_fee, state_contribution_amount, national_contribution_amount,
          club_retained_amount, club_to_state_status, state_to_national_status,
          membership_year, membership_start_date, membership_end_date, bulk_payment
        ) VALUES (
          p_member_id, v_member.club_id, v_club.state_association_id, v_state.national_association_id,
          v_total_fee, v_state_fee, v_national_fee,
          0, 'pending', 'pending',
          v_year, v_start, v_end, false
        );
        v_remit_created := true;
      END IF;
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Paid club-finance income transaction for the current cycle
  ----------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM transactions
    WHERE linked_entity_type = 'membership'
      AND linked_entity_id = p_member_id
      AND payment_status = 'paid'
      AND date >= v_start
  ) INTO v_has_paid_tx;

  IF NOT v_has_paid_tx THEN
    v_amount := COALESCE(v_member.amount_paid, 0);
    IF v_amount = 0 AND v_member.membership_level IS NOT NULL THEN
      SELECT amount INTO v_amount
      FROM membership_types
      WHERE club_id = v_member.club_id AND name = v_member.membership_level
      LIMIT 1;
      v_amount := COALESCE(v_amount, 0);
    END IF;

    IF v_amount > 0 THEN
      SELECT default_membership_category_id, COALESCE(tax_enabled, false), COALESCE(tax_rate, 0)
      INTO v_cat, v_tax_enabled, v_tax_rate
      FROM clubs WHERE id = v_member.club_id;

      v_base := v_amount;
      v_total := v_amount;
      v_tax := 0;
      IF v_tax_enabled AND v_tax_rate > 0 THEN
        v_tax := round(v_amount * v_tax_rate / (1 + v_tax_rate), 2);
        v_base := v_amount - v_tax;
      END IF;

      INSERT INTO transactions (
        club_id, type, category_id, description, amount, tax_amount, net_amount,
        date, payment_method, payment_status, payment_gateway,
        linked_entity_type, linked_entity_id, payer, reference
      ) VALUES (
        v_member.club_id, 'deposit', v_cat,
        'Membership: ' || v_name || ' - ' || COALESCE(v_member.membership_level, 'Membership'),
        v_total, v_tax, v_total, CURRENT_DATE, 'bank', 'paid', 'manual',
        'membership', p_member_id, v_name, p_member_id::text
      )
      RETURNING id INTO v_tx_id;

      INSERT INTO membership_transactions (
        club_id, member_id, transaction_id, amount, tax_amount, total_amount,
        payment_method, payment_status
      ) VALUES (
        v_member.club_id, p_member_id, v_tx_id, v_base, v_tax, v_total,
        'bank_transfer', 'paid'
      );
      v_tx_created := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'remittance_created', v_remit_created,
    'transaction_created', v_tx_created,
    'membership_year', v_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_renewal_financials(uuid) TO authenticated;