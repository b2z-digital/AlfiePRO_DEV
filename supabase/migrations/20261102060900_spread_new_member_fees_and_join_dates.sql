/*
# Spread new-member licence fees across the remaining financial year

1. Modified Tables
- `platform_billing_member_snapshots`
  - New column `fee_breakdown` (jsonb, default empty list): the line items used to work out
    the charge, e.g. continuing members vs members who joined in a given quarter, each with
    member count, per-member rate and amount. Used to show the calculation on invoices.

2. Functions
- Removed `count_billable_people` (replaced; it only counted people as of today).
- New `billable_people_join_dates(p_club_ids uuid[], p_joined_before timestamptz)`:
  returns one row per unique billable person (by linked account, otherwise email,
  otherwise membership record) with the date they first joined AlfiePRO. When
  `p_joined_before` is given, only people who joined before that moment are returned,
  so each billing period counts only people who were members by its end.
  Billable = not archived/cancelled, status active or expired, financial, and renewal
  date empty or not yet passed.

3. Security
- SECURITY INVOKER, so row level security on `members` still applies.
- EXECUTE revoked from PUBLIC/anon; granted to authenticated and service_role.
*/

ALTER TABLE public.platform_billing_member_snapshots
  ADD COLUMN IF NOT EXISTS fee_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.count_billable_people(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.billable_people_join_dates(
  p_club_ids uuid[],
  p_joined_before timestamptz DEFAULT NULL
)
RETURNS TABLE(first_joined timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT min(m.created_at)
  FROM members m
  WHERE m.club_id = ANY(p_club_ids)
    AND m.archived_at IS NULL
    AND m.cancelled_at IS NULL
    AND COALESCE(m.membership_status, 'active') IN ('active', 'expired')
    AND m.is_financial = true
    AND (m.renewal_date IS NULL OR m.renewal_date >= CURRENT_DATE)
  GROUP BY COALESCE('uid:' || m.user_id::text, 'email:' || lower(nullif(trim(m.email), '')), 'id:' || m.id::text)
  HAVING p_joined_before IS NULL OR min(m.created_at) < p_joined_before;
$$;

REVOKE EXECUTE ON FUNCTION public.billable_people_join_dates(uuid[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billable_people_join_dates(uuid[], timestamptz) TO authenticated, service_role;