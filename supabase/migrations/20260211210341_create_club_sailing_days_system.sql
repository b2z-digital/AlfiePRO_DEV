/*
  # Create Club Sailing Days System

  1. New Tables
    - `club_sailing_days`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `day_of_week` (text) - e.g., "Monday", "Tuesday", etc.
      - `start_time` (time) - sailing start time
      - `end_time` (time) - sailing end time
      - `boat_class_id` (uuid, foreign key to boat_classes, nullable)
      - `description` (text, nullable) - optional description
      - `is_active` (boolean) - whether this sailing day is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `club_sailing_days` table
    - Club admins can manage their club's sailing days
    - State/national association admins can view sailing days
    - Public can view sailing days for clubs
*/

-- Create club sailing days table
CREATE TABLE IF NOT EXISTS club_sailing_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  boat_class_id uuid REFERENCES boat_classes(id) ON DELETE SET NULL,
  description text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_club_sailing_days_club_id ON club_sailing_days(club_id);
CREATE INDEX IF NOT EXISTS idx_club_sailing_days_day_of_week ON club_sailing_days(day_of_week);
CREATE INDEX IF NOT EXISTS idx_club_sailing_days_boat_class_id ON club_sailing_days(boat_class_id);

-- Enable RLS
ALTER TABLE club_sailing_days ENABLE ROW LEVEL SECURITY;

-- Public can view sailing days
CREATE POLICY "Public can view sailing days"
  ON club_sailing_days
  FOR SELECT
  TO public
  USING (is_active = true);

-- Club admins can manage their club's sailing days
CREATE POLICY "Club admins can manage sailing days"
  ON club_sailing_days
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_sailing_days.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_sailing_days.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'super_admin')
    )
  );

-- Association admins can view sailing days in their region
CREATE POLICY "Association admins can view sailing days"
  ON club_sailing_days
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = club_sailing_days.club_id
        AND (
          is_association_admin(c.state_association_id, 'state')
          OR is_platform_super_admin()
        )
    )
  );

-- Update trigger
CREATE TRIGGER update_club_sailing_days_updated_at
  BEFORE UPDATE ON club_sailing_days
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();