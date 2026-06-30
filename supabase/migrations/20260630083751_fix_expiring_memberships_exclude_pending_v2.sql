DROP FUNCTION IF EXISTS get_expiring_memberships(uuid, integer);

CREATE FUNCTION get_expiring_memberships(p_club_id uuid, p_days_ahead integer)
RETURNS TABLE(
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  renewal_date date,
  days_until_expiry integer,
  membership_level text,
  is_financial boolean,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
RETURN QUERY
SELECT
m.id,
m.first_name,
m.last_name,
m.email,
m.renewal_date,
(m.renewal_date - CURRENT_DATE)::integer as days_until_expiry,
m.membership_level,
m.is_financial,
m.phone
FROM public.members m
WHERE m.club_id = p_club_id
AND m.renewal_date IS NOT NULL
AND m.renewal_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_days_ahead)
AND (m.membership_status = 'active' OR m.membership_status IS NULL)
AND COALESCE(m.payment_status, '') != 'pending'
ORDER BY m.renewal_date ASC;
END;
$$;