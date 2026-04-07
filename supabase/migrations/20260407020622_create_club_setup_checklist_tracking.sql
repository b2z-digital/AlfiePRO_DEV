/*
  # Create Club Setup Checklist Tracking

  1. New Tables
    - `club_setup_checklists`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `dismissed_at` (timestamptz, nullable) - when admin dismissed the checklist
      - `dismissed_by` (uuid, nullable) - who dismissed it
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Purpose
    - Tracks whether a club admin has dismissed the setup checklist
    - Actual completion status is computed by querying real data (membership types, finance settings, members, etc.)
    - This table only stores the dismissal state so admins can hide the checklist once they're satisfied

  3. Security
    - RLS enabled
    - Club admins can read and update their own club's checklist
    - Authenticated users can view their club's checklist status
*/

CREATE TABLE IF NOT EXISTS club_setup_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT NULL,
  dismissed_by uuid DEFAULT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT club_setup_checklists_club_id_unique UNIQUE (club_id)
);

ALTER TABLE club_setup_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view setup checklist"
  ON club_setup_checklists
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_setup_checklists.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can insert setup checklist"
  ON club_setup_checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_setup_checklists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin')
    )
  );

CREATE POLICY "Club admins can update setup checklist"
  ON club_setup_checklists
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_setup_checklists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_setup_checklists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin')
    )
  );

CREATE POLICY "Club admins can delete setup checklist"
  ON club_setup_checklists
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_setup_checklists.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin')
    )
  );
