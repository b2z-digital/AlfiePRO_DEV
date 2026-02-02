/*
  # Create Heat Observer System

  ## Overview
  Adds comprehensive observer functionality for heat racing events, allowing race officers
  to assign volunteer observers who monitor races for infringements.

  ## Changes

  1. **Quick Races Table Updates**
     - `enable_observers` (boolean) - Toggle observers on/off for heat racing
     - `observers_per_heat` (integer) - Number of observers required per heat (default 2)

  2. **New Table: heat_observers**
     - Tracks observer assignments for each heat
     - Links skippers to heats as observers
     - Stores assignment history and manual override flags

  3. **Security**
     - RLS policies for authenticated race officers to manage observers
     - Public read access for live tracking display

  4. **Indexes**
     - Performance indexes on foreign keys and common query patterns
*/

-- Add observer settings to quick_races table
ALTER TABLE quick_races
  ADD COLUMN IF NOT EXISTS enable_observers boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS observers_per_heat integer DEFAULT 2 CHECK (observers_per_heat >= 0 AND observers_per_heat <= 10);

-- Create heat_observers table
CREATE TABLE IF NOT EXISTS heat_observers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES quick_races(id) ON DELETE CASCADE,
  heat_number integer NOT NULL,
  race_number integer NOT NULL,
  skipper_index integer NOT NULL, -- Index of the skipper in the skippers array
  skipper_name text NOT NULL,
  skipper_sail_number text,
  assigned_at timestamptz DEFAULT now(),
  is_manual_assignment boolean DEFAULT false, -- True if race officer manually assigned
  times_served integer DEFAULT 0, -- Track how many times this skipper has been observer
  created_at timestamptz DEFAULT now(),
  
  -- Composite unique constraint to prevent duplicate observer assignments
  UNIQUE(event_id, heat_number, race_number, skipper_index)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_heat_observers_event_id ON heat_observers(event_id);
CREATE INDEX IF NOT EXISTS idx_heat_observers_heat_race ON heat_observers(event_id, heat_number, race_number);
CREATE INDEX IF NOT EXISTS idx_heat_observers_skipper ON heat_observers(event_id, skipper_index);

-- Add comment
COMMENT ON TABLE heat_observers IS 'Tracks observer assignments for heat racing events';
COMMENT ON COLUMN heat_observers.is_manual_assignment IS 'True if race officer manually assigned this observer, false if auto-assigned';
COMMENT ON COLUMN heat_observers.times_served IS 'Running count of how many times this skipper has served as observer';

-- Enable RLS
ALTER TABLE heat_observers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for heat_observers

-- Allow race officers (club members) to read observer assignments
CREATE POLICY "Club members can view heat observers"
  ON heat_observers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
      AND uc.user_id = auth.uid()
    )
  );

-- Allow public read access for live tracking
CREATE POLICY "Public can view heat observers for published events"
  ON heat_observers
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      WHERE qr.id = heat_observers.event_id
      AND qr.enable_live_tracking = true
    )
  );

-- Allow race officers to insert observer assignments
CREATE POLICY "Club members can assign heat observers"
  ON heat_observers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
      AND uc.user_id = auth.uid()
    )
  );

-- Allow race officers to update observer assignments
CREATE POLICY "Club members can update heat observers"
  ON heat_observers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
      AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
      AND uc.user_id = auth.uid()
    )
  );

-- Allow race officers to delete observer assignments
CREATE POLICY "Club members can delete heat observers"
  ON heat_observers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_races qr
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE qr.id = heat_observers.event_id
      AND uc.user_id = auth.uid()
    )
  );

-- Enable realtime for live observer notifications
ALTER PUBLICATION supabase_realtime ADD TABLE heat_observers;