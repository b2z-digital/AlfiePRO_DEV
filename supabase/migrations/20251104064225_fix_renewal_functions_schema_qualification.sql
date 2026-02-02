/*
  # Fix Renewal Functions with Schema Qualification

  This migration fixes the get_expiring_memberships and get_overdue_memberships
  functions to work properly with the empty search_path security requirement.

  1. Changes
    - Updates get_expiring_memberships to use schema-qualified table names
    - Updates get_overdue_memberships to use schema-qualified table names
    - Ensures functions work with empty search_path

  2. Security
    - Maintains SECURITY DEFINER with proper search_path = ''
*/

-- Fix get_expiring_memberships function
CREATE OR REPLACE FUNCTION public.get_expiring_memberships(p_club_id uuid, p_days_ahead integer DEFAULT 30)
RETURNS TABLE (
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
SET search_path TO ''
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
  ORDER BY m.renewal_date ASC;
END;
$$;

-- Fix get_overdue_memberships function
CREATE OR REPLACE FUNCTION public.get_overdue_memberships(p_club_id uuid)
RETURNS TABLE (
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
SET search_path TO ''
AS $$
DECLARE
  v_grace_period integer;
BEGIN
  -- Get club's grace period
  SELECT renewal_grace_period_days INTO v_grace_period
  FROM public.clubs
  WHERE id = p_club_id;

  IF v_grace_period IS NULL THEN
    v_grace_period := 7; -- Default grace period
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
  ORDER BY m.renewal_date DESC;
END;
$$;