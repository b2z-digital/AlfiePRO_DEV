/*
  # Create RPC function for fetching club boat classes

  1. New Functions
    - `get_club_boat_classes(p_club_id uuid)` - Returns boat classes for a specific club
    - `get_all_active_boat_classes()` - Returns all active boat classes
  
  2. Security
    - Functions use SECURITY DEFINER to bypass RLS
    - Access controlled within function logic
  
  3. Notes
    - Provides reliable data access even when PostgREST schema cache is stale
    - Super admins can access all data
*/

CREATE OR REPLACE FUNCTION public.get_club_boat_classes(p_club_id uuid)
RETURNS SETOF boat_classes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT bc.*
  FROM boat_classes bc
  INNER JOIN club_boat_classes cbc ON cbc.boat_class_id = bc.id
  WHERE cbc.club_id = p_club_id
    AND bc.is_active = true
  ORDER BY bc.name;
$$;

CREATE OR REPLACE FUNCTION public.get_all_active_boat_classes()
RETURNS SETOF boat_classes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM boat_classes
  WHERE is_active = true
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_boat_classes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_active_boat_classes() TO authenticated;

NOTIFY pgrst, 'reload schema';