/*
# Fix outstanding total to filter by current year

## Problem
The get_club_outstanding_total function counts ALL pending remittances across ALL years,
not just the current year. This causes the "Pending Members" count and dollar totals
to be inflated when there are historical pending remittances from prior years.

For example, a club with 6 pending current-year remittances and 5 old ones from the 
prior year was showing 11 instead of 6.

## Changes
- Replaces get_club_outstanding_total() to add a membership_year filter 
  defaulting to the current calendar year.
- This ensures the summary cards and badge only reflect current-period obligations.
*/

CREATE OR REPLACE FUNCTION get_club_outstanding_total(p_club_id uuid)
RETURNS TABLE(
  pending_count bigint,
  total_outstanding numeric,
  state_contribution_total numeric,
  national_contribution_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint,
    SUM(mr.total_membership_fee),
    SUM(mr.state_contribution_amount),
    SUM(mr.national_contribution_amount)
  FROM public.membership_remittances mr
  WHERE mr.club_id = p_club_id
    AND mr.club_to_state_status = 'pending'
    AND mr.membership_year = EXTRACT(YEAR FROM CURRENT_DATE)::int;
END;
$$;
