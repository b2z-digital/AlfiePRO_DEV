/*
  # Fix anniversary-mode club members to use financial year dates

  1. Problem
    - Clubs without a fixed_renewal_date had members backfilled with today's date
      and a 1-year anniversary renewal, instead of the standard financial year
    - All Australian clubs operate on a July 1 - June 30 financial year

  2. Fix
    - Update members in anniversary-mode clubs (no fixed_renewal_date) that
      were incorrectly given today's date as date_joined
    - Set date_joined to 1 July 2025 (start of current financial year)
    - Set renewal_date to 30 June 2026 (end of current financial year)

  3. Scope
    - Only affects members whose date_joined = CURRENT_DATE (set by the
      previous backfill migration)
    - Does not affect clubs that already have a fixed_renewal_date configured
*/

UPDATE public.members
SET
  date_joined = '2025-07-01'::date,
  renewal_date = '2026-06-30'::date,
  updated_at = now()
WHERE club_id IN (
  SELECT id FROM public.clubs
  WHERE fixed_renewal_date IS NULL
)
AND date_joined = '2026-04-10'::date
AND renewal_date = '2027-04-10'::date
AND membership_status != 'archived';
