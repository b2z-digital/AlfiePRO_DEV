/*
  # Create event_attendance table

  1. New Tables
    - `event_attendance`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - references auth.users
      - `event_id` (uuid) - for quick_races/public_events
      - `series_id` (uuid) - for race_series
      - `round_name` (text) - for specific rounds in a series
      - `club_id` (uuid) - references clubs
      - `status` (text) - 'yes', 'no', 'maybe'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `event_attendance` table
    - Add policies for users to manage their own attendance
  
  3. Indexes
    - Index on (event_id, user_id)
    - Index on (series_id, round_name, user_id)
    - Index on user_id for performance
*/

-- Create event_attendance table
CREATE TABLE IF NOT EXISTS event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid,
  series_id uuid,
  round_name text,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_attendance_user_id ON event_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_event_id ON event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_series_id ON event_attendance(series_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_event_user ON event_attendance(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_series_round_user ON event_attendance(series_id, round_name, user_id);

-- RLS Policies

-- Users can view all attendance for events they have access to
CREATE POLICY "Users can view attendance for club events"
  ON event_attendance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_attendance.club_id
    )
  );

-- Users can insert their own attendance
CREATE POLICY "Users can create own attendance"
  ON event_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own attendance
CREATE POLICY "Users can update own attendance"
  ON event_attendance
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own attendance
CREATE POLICY "Users can delete own attendance"
  ON event_attendance
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_event_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_attendance_updated_at
  BEFORE UPDATE ON event_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_event_attendance_updated_at();