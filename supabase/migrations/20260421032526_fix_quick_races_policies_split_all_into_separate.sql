/*
  # Split quick_races ALL policies into separate CRUD policies

  1. Changes
    - Replaced ALL policies with separate SELECT/INSERT/UPDATE/DELETE policies
    - SELECT policies exclude simulated events (is_simulated = true)
    - INSERT/UPDATE/DELETE policies allow simulated events to be managed normally
    - Dedicated RPC function handles fetching simulated events for admin UI

  2. Security
    - Simulated events are invisible in all normal SELECT queries (web, mobile, public)
    - Club admins can still create, update, and delete simulated events
    - Only the `get_simulated_race_events` RPC returns simulated events
*/

-- First drop ALL existing policies to start clean
DROP POLICY IF EXISTS "Club members can manage races" ON public.quick_races;
DROP POLICY IF EXISTS "Club members or Super Admins can manage races" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can manage own events" ON public.quick_races;
DROP POLICY IF EXISTS "Club members can view non-simulated races" ON public.quick_races;
DROP POLICY IF EXISTS "Club members can insert races" ON public.quick_races;
DROP POLICY IF EXISTS "Club members can update races" ON public.quick_races;
DROP POLICY IF EXISTS "Club members can delete races" ON public.quick_races;
DROP POLICY IF EXISTS "Super admins can view non-simulated races" ON public.quick_races;
DROP POLICY IF EXISTS "Super admins can insert races" ON public.quick_races;
DROP POLICY IF EXISTS "Super admins can update races" ON public.quick_races;
DROP POLICY IF EXISTS "Super admins can delete races" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can view own non-simulated events" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can insert own events" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can update own events" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can update own events v2" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can delete own events" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can delete own events v2" ON public.quick_races;
DROP POLICY IF EXISTS "Race officers can view own events" ON public.quick_races;
DROP POLICY IF EXISTS "Users can view races of their clubs" ON public.quick_races;
DROP POLICY IF EXISTS "Public can view quick races" ON public.quick_races;
DROP POLICY IF EXISTS "Public can view races" ON public.quick_races;
DROP POLICY IF EXISTS "Public can view completed races" ON public.quick_races;

-- PUBLIC SELECT: exclude simulated events
CREATE POLICY "Public can view races"
  ON public.quick_races
  FOR SELECT
  TO public
  USING (COALESCE(is_simulated, false) = false);

-- AUTHENTICATED SELECT: club members see non-simulated races
CREATE POLICY "Club members can view races"
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

-- AUTHENTICATED SELECT: super admins see non-simulated races
CREATE POLICY "Super admins can view races"
  ON public.quick_races
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_simulated, false) = false
    AND is_platform_super_admin()
  );

-- AUTHENTICATED SELECT: race officers see own non-simulated events
CREATE POLICY "Race officers can view own events"
  ON public.quick_races
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_simulated, false) = false
    AND auth.uid() = user_id
    AND club_id IS NULL
  );

-- INSERT policies (allow simulated events to be created)
CREATE POLICY "Club members can insert races"
  ON public.quick_races
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = quick_races.club_id
      AND uc.user_id = auth.uid()
    )
    OR is_platform_super_admin()
  );

CREATE POLICY "Race officers can insert own events"
  ON public.quick_races
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND club_id IS NULL);

-- UPDATE policies (allow simulated events to be updated)
CREATE POLICY "Club members can update races"
  ON public.quick_races
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = quick_races.club_id
      AND uc.user_id = auth.uid()
    )
    OR is_platform_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = quick_races.club_id
      AND uc.user_id = auth.uid()
    )
    OR is_platform_super_admin()
  );

CREATE POLICY "Race officers can update own events"
  ON public.quick_races
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND club_id IS NULL)
  WITH CHECK (auth.uid() = user_id AND club_id IS NULL);

-- DELETE policies (allow simulated events to be deleted)
CREATE POLICY "Club members can delete races"
  ON public.quick_races
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = quick_races.club_id
      AND uc.user_id = auth.uid()
    )
    OR is_platform_super_admin()
  );

CREATE POLICY "Race officers can delete own events"
  ON public.quick_races
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND club_id IS NULL);
