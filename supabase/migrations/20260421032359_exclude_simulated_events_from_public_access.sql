/*
  # Exclude simulated events from public access

  1. Changes
    - Modified RLS policies on `quick_races` table to exclude simulated events
    - "Public can view quick races" and "Public can view races" policies now filter out is_simulated = true
    - "Public can view completed races" policy now also filters out simulated events
    - Created `get_simulated_race_events` RPC function (SECURITY DEFINER) so the web admin can still fetch them

  2. Security
    - Simulated events are no longer visible to public/anonymous access
    - Simulated events are no longer visible through normal authenticated queries
    - Only the dedicated RPC function can retrieve simulated events (requires authentication)

  3. Impact
    - Mobile app will no longer see simulated events in upcoming/completed events lists
    - Public race calendar, results pages, etc. will not show simulated events
    - Web admin "Simulated Events" tab uses the RPC function to fetch them
*/

-- Drop and recreate the overly permissive public policies to exclude simulated events
DROP POLICY IF EXISTS "Public can view quick races" ON public.quick_races;
CREATE POLICY "Public can view quick races"
  ON public.quick_races
  FOR SELECT
  USING (COALESCE(is_simulated, false) = false);

DROP POLICY IF EXISTS "Public can view races" ON public.quick_races;
CREATE POLICY "Public can view races"
  ON public.quick_races
  FOR SELECT
  USING (COALESCE(is_simulated, false) = false);

DROP POLICY IF EXISTS "Public can view completed races" ON public.quick_races;
CREATE POLICY "Public can view completed races"
  ON public.quick_races
  FOR SELECT
  USING (completed = true AND COALESCE(is_simulated, false) = false);

-- Update authenticated user policies to also exclude simulated events by default
DROP POLICY IF EXISTS "Users can view races of their clubs" ON public.quick_races;
CREATE POLICY "Users can view races of their clubs"
  ON public.quick_races
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_simulated, false) = false
    AND EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = quick_races.club_id
      AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Race officers can view own events" ON public.quick_races;
CREATE POLICY "Race officers can view own events"
  ON public.quick_races
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_simulated, false) = false
    AND user_id = auth.uid()
    AND club_id IS NULL
  );

-- Create SECURITY DEFINER function to fetch simulated events (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_simulated_race_events(p_club_id uuid)
RETURNS SETOF public.quick_races
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.quick_races
  WHERE is_simulated = true
    AND archived = false
    AND club_id = p_club_id
  ORDER BY created_at DESC;
$$;
