/*
  # Create Race Day Sign-On/Sign-Off System

  1. New Tables
    - `race_day_sign_on`
      - `id` (uuid, primary key)
      - `event_id` (text)
      - `club_id` (uuid, references clubs)
      - `race_day` (date) - which day of the event
      - `skipper_name` (text)
      - `sail_number` (text)
      - `member_id` (uuid, nullable - references members)
      - `signed_on_at` (timestamptz) - when they signed on
      - `signed_off_at` (timestamptz, nullable) - when they signed off (null = still on water)
      - `signed_on_by` (text: 'self', 'admin') - who performed the sign-on
      - `emergency_contact_name` (text, nullable)
      - `emergency_contact_phone` (text, nullable)
      - `notes` (text, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Club members can view sign-on sheets for their club events
    - Members can sign themselves on/off
    - Admins can manage all sign-on entries

  3. Important Notes
    - This replaces paper sign-on sheets
    - Safety critical: know who is on the water at any time
    - Sign-off is important for confirming all boats returned safely
*/

CREATE TABLE IF NOT EXISTS race_day_sign_on (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  race_day date NOT NULL DEFAULT CURRENT_DATE,
  skipper_name text NOT NULL,
  sail_number text NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id),
  signed_on_at timestamptz DEFAULT now(),
  signed_off_at timestamptz,
  signed_on_by text NOT NULL DEFAULT 'self',
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_signed_on_by CHECK (signed_on_by IN ('self', 'admin'))
);

ALTER TABLE race_day_sign_on ENABLE ROW LEVEL SECURITY;

-- Club members can view sign-on sheets
CREATE POLICY "Club members can view sign-on sheets"
  ON race_day_sign_on FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_day_sign_on.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Members can sign themselves on
CREATE POLICY "Members can sign on"
  ON race_day_sign_on FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_day_sign_on.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Members can update their own sign-on (for sign-off) or admins can update any
CREATE POLICY "Members can sign off or admins manage"
  ON race_day_sign_on FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_day_sign_on.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_day_sign_on.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Admins can delete sign-on entries
CREATE POLICY "Admins can delete sign-on entries"
  ON race_day_sign_on FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_day_sign_on.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_race_day_sign_on_event_id ON race_day_sign_on(event_id);
CREATE INDEX IF NOT EXISTS idx_race_day_sign_on_club_id ON race_day_sign_on(club_id);
CREATE INDEX IF NOT EXISTS idx_race_day_sign_on_race_day ON race_day_sign_on(race_day);
CREATE INDEX IF NOT EXISTS idx_race_day_sign_on_not_signed_off ON race_day_sign_on(club_id, race_day) WHERE signed_off_at IS NULL;
