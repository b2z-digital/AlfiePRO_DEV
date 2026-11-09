/*
# Unique billable people count for platform billing

1. Purpose
- Platform licence fees were counted from membership records with status "active" only.
  That double-counted people in more than one club, and missed paid-up renewals still
  labelled "expired".
- This adds one shared counting function used by both the billing generator and the
  super-admin forecast.

2. New Function `count_billable_people(p_club_ids uuid[], p_period_start date, p_period_end date)`
- Counts unique people across the given clubs (identified by linked account, otherwise
  email, otherwise the membership record).
- A membership is billable when it is not archived/cancelled, status is active or expired,
  is_financial is true, and renewal_date is empty or not yet passed.
- Returns `total_people` and `new_people` (people whose first billable membership was
  created within the period start (inclusive) to period end (exclusive)).

3. Security
- SECURITY INVOKER: row level security on `members` still applies to the caller.
- EXECUTE revoked from PUBLIC/anon; granted to authenticated and service_role.
*/

CREATE OR REPLACE FUNCTION public.count_billable_people(
  p_club_ids uuid[],
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS TABLE(total_people integer, new_people integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH billable AS (
    SELECT
      COALESCE('uid:' || m.user_id::text, 'email:' || lower(nullif(trim(m.email), '')), 'id:' || m.id::text) AS person,
      m.created_at
    FROM members m
    WHERE m.club_id = ANY(p_club_ids)
      AND m.archived_at IS NULL
      AND m.cancelled_at IS NULL
      AND COALESCE(m.membership_status, 'active') IN ('active', 'expired')
      AND m.is_financial = true
      AND (m.renewal_date IS NULL OR m.renewal_date >= CURRENT_DATE)
  ), people AS (
    SELECT person, min(created_at) AS first_created FROM billable GROUP BY person
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE p_period_start IS NOT NULL AND p_period_end IS NOT NULL
        AND first_created >= p_period_start AND first_created < p_period_end
    )::integer
  FROM people;
$$;

REVOKE EXECUTE ON FUNCTION public.count_billable_people(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_billable_people(uuid[], date, date) TO authenticated, service_role;