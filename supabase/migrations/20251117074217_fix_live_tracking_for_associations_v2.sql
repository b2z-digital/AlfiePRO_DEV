/*
  # Fix Live Tracking for State and National Association Events

  ## Problem
  The `live_tracking_events` table requires a `club_id`, but State and National
  Association events don't have a `club_id`. This prevents live tracking from
  working for association events.

  ## Changes
  1. Make `club_id` nullable in `live_tracking_events`
  2. Add `state_association_id` and `national_association_id` columns
  3. Add a check constraint to ensure at least one organization ID is present
  4. Update RLS policies to support association admins
  5. Add SELECT policy so admins can read their tracking events

  ## Security
  - State association admins can manage live tracking for their events
  - National association admins can manage live tracking for their events
  - Public can still view enabled events (for QR code access)
*/

-- Make club_id nullable
ALTER TABLE live_tracking_events
  ALTER COLUMN club_id DROP NOT NULL;

-- Add association ID columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE live_tracking_events
      ADD COLUMN state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'live_tracking_events' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE live_tracking_events
      ADD COLUMN national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add check constraint to ensure at least one organization ID is present
ALTER TABLE live_tracking_events
  DROP CONSTRAINT IF EXISTS live_tracking_events_org_check;

ALTER TABLE live_tracking_events
  ADD CONSTRAINT live_tracking_events_org_check CHECK (
    club_id IS NOT NULL OR
    state_association_id IS NOT NULL OR
    national_association_id IS NOT NULL
  );

-- Drop existing policies that only check club_id
DROP POLICY IF EXISTS "Club admins can create live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Club admins can update live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Club admins can delete live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Club admins can manage live tracking" ON live_tracking_events;

-- Create new policies that support all organization types

-- SELECT policy: Org admins can view their events + public can view enabled events
CREATE POLICY "Org admins and public can view live tracking"
  ON live_tracking_events FOR SELECT
  USING (
    -- Club admins/members
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor', 'member', 'pro')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.state_association_id = live_tracking_events.state_association_id
      AND usa.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.national_association_id = live_tracking_events.national_association_id
      AND una.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- Public can view enabled events
    enabled = true
  );

-- INSERT policy: Admins can create tracking events for their organizations
CREATE POLICY "Org admins can create live tracking"
  ON live_tracking_events FOR INSERT
  WITH CHECK (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.state_association_id = live_tracking_events.state_association_id
      AND usa.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.national_association_id = live_tracking_events.national_association_id
      AND una.role IN ('admin', 'super_admin', 'editor')
    ))
  );

-- UPDATE policy: Admins can update tracking events for their organizations
CREATE POLICY "Org admins can update live tracking"
  ON live_tracking_events FOR UPDATE
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.state_association_id = live_tracking_events.state_association_id
      AND usa.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.national_association_id = live_tracking_events.national_association_id
      AND una.role IN ('admin', 'super_admin', 'editor')
    ))
  );

-- DELETE policy: Admins can delete tracking events for their organizations
CREATE POLICY "Org admins can delete live tracking"
  ON live_tracking_events FOR DELETE
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.state_association_id = live_tracking_events.state_association_id
      AND usa.role IN ('admin', 'super_admin', 'editor')
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.national_association_id = live_tracking_events.national_association_id
      AND una.role IN ('admin', 'super_admin', 'editor')
    ))
  );

-- Add indexes for the new foreign keys
CREATE INDEX IF NOT EXISTS idx_live_tracking_events_state_association
  ON live_tracking_events(state_association_id);

CREATE INDEX IF NOT EXISTS idx_live_tracking_events_national_association
  ON live_tracking_events(national_association_id);
