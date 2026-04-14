/*
  # Fix heat_observers RLS policies for series events

  ## Problem
  All RLS policies on `heat_observers` only check the `quick_races` table when
  validating `event_id`. For series events, the `event_id` references a row in
  `race_series_rounds` instead, causing all observer operations (select, insert,
  update, delete) to be silently denied by RLS.

  ## Changes
  1. Drop all existing heat_observers policies
  2. Recreate policies that check BOTH `quick_races` AND `race_series_rounds`
  3. Maintain the same access pattern: club members can manage observers for their clubs

  ## Security
  - Authenticated users can only access observers for events belonging to clubs they are members of
  - Public users can view observers for published live-tracking events (quick_races only)
*/

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can view heat observers') THEN
    DROP POLICY "Club members can view heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can assign heat observers') THEN
    DROP POLICY "Club members can assign heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can update heat observers') THEN
    DROP POLICY "Club members can update heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Club members can delete heat observers') THEN
    DROP POLICY "Club members can delete heat observers" ON heat_observers;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_observers' AND policyname = 'Public can view heat observers for published events') THEN
    DROP POLICY "Public can view heat observers for published events" ON heat_observers;
  END IF;
END $$;

CREATE POLICY "Club members can view heat observers"
  ON heat_observers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM race_series_rounds rsr
      JOIN race_series rs ON rs.id = rsr.series_id
      JOIN user_clubs uc ON uc.club_id = rsr.club_id
      WHERE rsr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club members can assign heat observers"
  ON heat_observers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM race_series_rounds rsr
      JOIN race_series rs ON rs.id = rsr.series_id
      JOIN user_clubs uc ON uc.club_id = rsr.club_id
      WHERE rsr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club members can update heat observers"
  ON heat_observers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM race_series_rounds rsr
      JOIN race_series rs ON rs.id = rsr.series_id
      JOIN user_clubs uc ON uc.club_id = rsr.club_id
      WHERE rsr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM race_series_rounds rsr
      JOIN race_series rs ON rs.id = rsr.series_id
      JOIN user_clubs uc ON uc.club_id = rsr.club_id
      WHERE rsr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club members can delete heat observers"
  ON heat_observers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM race_series_rounds rsr
      JOIN race_series rs ON rs.id = rsr.series_id
      JOIN user_clubs uc ON uc.club_id = rsr.club_id
      WHERE rsr.id = heat_observers.event_id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can view heat observers for published events"
  ON heat_observers FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      WHERE qr.id = heat_observers.event_id
        AND qr.enable_live_tracking = true
    )
  );
