/*
  # Create Race Reports Table

  1. New Tables
    - `race_reports`
      - `id` (uuid, primary key)
      - `event_id` (text, references the event - can be quick_race, race_series, or public event)
      - `event_type` (text, type of event: 'quick_race', 'race_series', 'public_event')
      - `club_id` (uuid, references clubs table)
      - `report_content` (text, the generated race report content)
      - `event_data` (jsonb, snapshot of event data at time of report generation)
      - `weather_conditions` (text, weather conditions provided)
      - `key_highlights` (text, key highlights provided)
      - `people_to_congratulate` (text, people to congratulate)
      - `generated_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `race_reports` table
    - Add policies for authenticated users to read reports for their clubs
    - Add policies for authenticated users to create/update reports for their clubs
*/

CREATE TABLE IF NOT EXISTS race_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  report_content text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  weather_conditions text,
  key_highlights text,
  people_to_congratulate text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE race_reports ENABLE ROW LEVEL SECURITY;

-- Policy for users to read race reports for their clubs
CREATE POLICY "Users can read race reports for their clubs"
  ON race_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_reports.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Policy for users to create race reports for their clubs
CREATE POLICY "Users can create race reports for their clubs"
  ON race_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_reports.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Policy for users to update race reports for their clubs
CREATE POLICY "Users can update race reports for their clubs"
  ON race_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_reports.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_reports.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Policy for users to delete race reports for their clubs
CREATE POLICY "Users can delete race reports for their clubs"
  ON race_reports
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_reports.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_race_reports_event_id ON race_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_race_reports_club_id ON race_reports(club_id);
CREATE INDEX IF NOT EXISTS idx_race_reports_created_at ON race_reports(created_at DESC);