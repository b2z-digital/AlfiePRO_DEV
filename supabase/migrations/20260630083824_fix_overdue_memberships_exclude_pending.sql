DROP FUNCTION IF EXISTS get_overdue_memberships(uuid);

CREATE FUNCTION get_overdue_memberships(p_club_id uuid)
RETURNS TABLE(
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  renewal_date date,
  days_overdue integer,
  membership_level text,
  grace_period_expired boolean,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_grace_period integer;
BEGIN
SELECT renewal_grace_period_days INTO v_grace_period
FROM public.clubs
WHERE id = p_club_id;

IF v_grace_period IS NULL THEN
v_grace_period := 7;
END IF;

RETURN QUERY
SELECT
m.id,
m.first_name,
m.last_name,
m.email,
m.renewal_date,
(CURRENT_DATE - m.renewal_date)::integer as days_overdue,
m.membership_level,
(CURRENT_DATE - m.renewal_date) > v_grace_period as grace_period_expired,
m.phone
FROM public.members m
WHERE m.club_id = p_club_id
AND m.renewal_date IS NOT NULL
AND m.renewal_date < CURRENT_DATE
AND (m.membership_status = 'active' OR m.membership_status IS NULL)
AND COALESCE(m.payment_status, '') != 'pending'
ORDER BY m.renewal_date DESC;
END;
$$;