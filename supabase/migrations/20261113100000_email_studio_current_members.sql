-- Email studio: "current" and "lapsed" now mean what the Members pages mean.
-- The studio read members.membership_status, which is stale for many members ('expired' on people who
-- have since renewed: financial with a renewal date in the future). The Members pages count a member as
-- current when they are financial and their renewal date has not passed. Use the same rule here.
-- Someone who belongs to two clubs is current if any of their memberships is.
CREATE OR REPLACE FUNCTION public.email_studio_people(p_club uuid)
RETURNS TABLE (member_id uuid, email text, first_name text, last_name text, user_id uuid, status text, financial boolean,
               level text, renewal_date date, date_joined date, activated boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT m.id, lower(trim(m.email)) AS email, coalesce(nullif(trim(m.first_name), ''), '') AS first_name, coalesce(trim(m.last_name), '') AS last_name,
           m.user_id,
           coalesce(m.is_financial, false) AND (m.renewal_date IS NULL OR m.renewal_date >= current_date) AS is_current,
           coalesce(nullif(trim(m.membership_level_custom), ''), nullif(trim(m.membership_level), '')) AS level,
           m.renewal_date, m.date_joined,
           m.user_id IS NOT NULL AND coalesce(m.activation_status, '') <> 'pending' AS activated
    FROM members m
    WHERE m.club_id IN (SELECT public.email_studio_org_clubs(p_club))
      AND m.archived_at IS NULL
      AND coalesce(m.membership_status, 'active') IN ('active', 'expired')
      AND coalesce(m.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ), q AS (
    SELECT p.*, bool_or(p.is_current) OVER (PARTITION BY p.email, lower(p.first_name), lower(p.last_name)) AS person_current
    FROM p
  )
  SELECT q.id, q.email, q.first_name, q.last_name, q.user_id,
         CASE WHEN q.person_current THEN 'active' ELSE 'expired' END, q.person_current,
         q.level, q.renewal_date, q.date_joined, q.activated
  FROM q
$$;

REVOKE ALL ON FUNCTION public.email_studio_people(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_studio_people(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_studio_people(uuid) TO service_role;
