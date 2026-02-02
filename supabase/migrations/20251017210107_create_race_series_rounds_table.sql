/*
  # Create Race Series Rounds Table

  1. New Table
    - `race_series_rounds`
      - `id` (uuid, primary key)
      - `series_id` (uuid, foreign key to race_series)
      - `club_id` (uuid, foreign key to clubs)
      - `round_name` (text) - e.g., "Round 1", "Round 2"
      - `round_index` (integer) - ordering of rounds within series
      - `date` (date)
      - `venue` (text)
      - `race_class` (text)
      - `race_format` (text) - handicap or scratch
      - `skippers` (jsonb) - array of skipper objects
      - `race_results` (jsonb) - array of race result objects
      - `last_completed_race` (integer)
      - `has_determined_initial_hcaps` (boolean)
      - `is_manual_handicaps` (boolean)
      - `completed` (boolean)
      - `cancelled` (boolean)
      - `cancellation_reason` (text)
      - `heat_management` (jsonb)
      - `num_races` (integer)
      - `drop_rules` (jsonb)
      - `multi_day` (boolean)
      - `number_of_days` (integer)
      - `day_results` (jsonb)
      - `current_day` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users to manage rounds in their club's series
    
  3. Migration Strategy
    - Existing rounds in race_series.rounds JSONB will remain for backward compatibility
    - New rounds will be created in this table
    - Future: migrate existing rounds from JSONB to this table
*/

-- Create race_series_rounds table
CREATE TABLE IF NOT EXISTS race_series_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES race_series(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  round_name text NOT NULL,
  round_index integer NOT NULL,
  date date NOT NULL,
  venue text,
  race_class text,
  race_format text DEFAULT 'handicap',
  skippers jsonb DEFAULT '[]'::jsonb,
  race_results jsonb DEFAULT '[]'::jsonb,
  last_completed_race integer DEFAULT 0,
  has_determined_initial_hcaps boolean DEFAULT false,
  is_manual_handicaps boolean DEFAULT false,
  completed boolean DEFAULT false,
  cancelled boolean DEFAULT false,
  cancellation_reason text,
  heat_management jsonb,
  num_races integer DEFAULT 12,
  drop_rules jsonb DEFAULT '[]'::jsonb,
  multi_day boolean DEFAULT false,
  number_of_days integer DEFAULT 1,
  day_results jsonb,
  current_day integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_series_round_index UNIQUE (series_id, round_index)
);

-- Enable RLS
ALTER TABLE race_series_rounds ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view rounds in their club's series
CREATE POLICY "Members can view club series rounds"
  ON race_series_rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series_rounds.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Policy: Admins can insert rounds in their club's series
CREATE POLICY "Admins can insert club series rounds"
  ON race_series_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series_rounds.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy: Admins and race officers can update rounds
CREATE POLICY "Admins and race officers can update club series rounds"
  ON race_series_rounds
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series_rounds.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series_rounds.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Policy: Admins can delete rounds
CREATE POLICY "Admins can delete club series rounds"
  ON race_series_rounds
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series_rounds.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_race_series_rounds_series_id ON race_series_rounds(series_id);
CREATE INDEX IF NOT EXISTS idx_race_series_rounds_club_id ON race_series_rounds(club_id);
CREATE INDEX IF NOT EXISTS idx_race_series_rounds_date ON race_series_rounds(date);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_race_series_rounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER race_series_rounds_updated_at
  BEFORE UPDATE ON race_series_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_race_series_rounds_updated_at();