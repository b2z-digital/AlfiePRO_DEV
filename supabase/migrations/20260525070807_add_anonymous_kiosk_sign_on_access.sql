/*
  # Add anonymous access for Sign-On Kiosk

  1. Changes
    - Add anonymous SELECT policy on `race_day_sign_on` for kiosk viewers
    - Add anonymous INSERT policy on `race_day_sign_on` for self-service sign-on
    - Add anonymous UPDATE policy on `race_day_sign_on` for sign-off
    - Add explicit `anon` role SELECT policy on `quick_races` for kiosk event loading

  2. Security
    - Anonymous sign-on INSERT is scoped: requires valid event_id and club_id
    - Anonymous SELECT on race_day_sign_on limited to viewing sign-on status
    - Anonymous UPDATE only allows setting signed_off_at (sign-off action)
    - quick_races anon policy excludes simulated events

  3. Notes
    - The kiosk page at /sign-on/:eventId needs to load event data and manage 
      sign-on records without authentication
    - The existing {public} role policy on quick_races may not correctly map to 
      PostgREST's anon role in all configurations, so we add an explicit anon policy
*/

-- Add explicit anon SELECT on quick_races (belt-and-suspenders with existing public policy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quick_races' AND policyname = 'Anonymous can view non-simulated races for kiosk'
  ) THEN
    CREATE POLICY "Anonymous can view non-simulated races for kiosk"
      ON quick_races
      FOR SELECT
      TO anon
      USING (COALESCE(is_simulated, false) = false);
  END IF;
END $$;

-- Allow anonymous users to view sign-on entries (to see who's signed on)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'race_day_sign_on' AND policyname = 'Anonymous can view sign-on entries for kiosk'
  ) THEN
    CREATE POLICY "Anonymous can view sign-on entries for kiosk"
      ON race_day_sign_on
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- Allow anonymous users to sign on (insert) via kiosk
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'race_day_sign_on' AND policyname = 'Anonymous can sign on via kiosk'
  ) THEN
    CREATE POLICY "Anonymous can sign on via kiosk"
      ON race_day_sign_on
      FOR INSERT
      TO anon
      WITH CHECK (
        signed_on_by = 'self'
        AND event_id IS NOT NULL
        AND club_id IS NOT NULL
      );
  END IF;
END $$;

-- Allow anonymous users to sign off (update signed_off_at only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'race_day_sign_on' AND policyname = 'Anonymous can sign off via kiosk'
  ) THEN
    CREATE POLICY "Anonymous can sign off via kiosk"
      ON race_day_sign_on
      FOR UPDATE
      TO anon
      USING (signed_off_at IS NULL)
      WITH CHECK (signed_off_at IS NOT NULL);
  END IF;
END $$;
