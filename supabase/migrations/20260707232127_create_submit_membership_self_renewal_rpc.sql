-- Member self-renewal (bank transfer) previously failed with an RLS row-violation
-- because members have no INSERT policy on membership_renewals, and the flow also
-- writes to transactions / membership_transactions which are admin-only.
-- Granting members direct INSERT on finance tables would be unsafe, so the whole
-- self-renewal submission is performed by this SECURITY DEFINER function which
-- validates that the caller owns the member row before writing.

CREATE OR REPLACE FUNCTION public.submit_membership_self_renewal(
  p_member_id uuid,
  p_membership_type_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member record;
  v_type record;
  v_cat uuid;
  v_tax_enabled boolean;
  v_tax_rate numeric;
  v_tax numeric := 0;
  v_base numeric;
  v_total numeric;
  v_tx_id uuid;
  v_name text;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  IF v_member.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to renew this membership');
  END IF;

  SELECT * INTO v_type
  FROM membership_types
  WHERE id = p_membership_type_id AND club_id = v_member.club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membership type not found');
  END IF;

  v_name := trim(coalesce(v_member.first_name, '') || ' ' || coalesce(v_member.last_name, ''));

  INSERT INTO membership_renewals (
    member_id, membership_type_id, renewal_date, expiry_date,
    amount_paid, payment_method, payment_reference
  ) VALUES (
    p_member_id, p_membership_type_id, CURRENT_DATE,
    (CURRENT_DATE + INTERVAL '1 year')::date,
    v_type.amount, 'bank_transfer', NULL
  );

  INSERT INTO membership_payments (
    member_id, membership_type_id, amount, currency, status, payment_method
  ) VALUES (
    p_member_id, p_membership_type_id, v_type.amount, v_type.currency, 'pending', 'bank_transfer'
  );

  UPDATE members
  SET payment_status = 'pending', membership_level = v_type.name
  WHERE id = p_member_id;

  SELECT default_membership_category_id, COALESCE(tax_enabled, false), COALESCE(tax_rate, 0)
  INTO v_cat, v_tax_enabled, v_tax_rate
  FROM clubs WHERE id = v_member.club_id;

  v_total := v_type.amount;
  v_base := v_type.amount;
  IF v_tax_enabled AND v_tax_rate > 0 THEN
    v_tax := round(v_type.amount * v_tax_rate / (1 + v_tax_rate), 2);
    v_base := v_type.amount - v_tax;
  END IF;

  INSERT INTO transactions (
    club_id, type, category_id, description, amount, tax_amount, net_amount,
    date, payment_method, payment_status, payment_gateway,
    linked_entity_type, linked_entity_id, payer, reference
  ) VALUES (
    v_member.club_id, 'deposit', v_cat,
    'Membership: ' || v_name || ' - ' || v_type.name,
    v_total, v_tax, v_total, CURRENT_DATE, 'bank', 'awaiting_payment', 'manual',
    'membership', p_member_id, v_name, p_member_id::text
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO membership_transactions (
    club_id, member_id, transaction_id, membership_type_id,
    amount, tax_amount, total_amount, payment_method, payment_status
  ) VALUES (
    v_member.club_id, p_member_id, v_tx_id, p_membership_type_id,
    v_base, v_tax, v_total, 'bank_transfer', 'pending'
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_membership_self_renewal(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_membership_self_renewal(uuid, uuid) TO authenticated;