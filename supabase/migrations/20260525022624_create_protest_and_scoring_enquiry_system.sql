/*
  # Create Digital Protest & Scoring Enquiry System

  1. New Tables
    - `event_protests` - for filing, scheduling, and recording protest decisions
      - `id` (uuid, primary key)
      - `event_id` (text)
      - `club_id` (uuid, references clubs)
      - `protest_type` (text: boat_vs_boat, race_committee, redress_request, scoring_enquiry)
      - `status` (text: filed, scheduled, heard, decided, withdrawn)
      - `filed_by_user_id` (uuid)
      - `filed_by_name`, `filed_by_sail_number` (text)
      - `protestee_sail_number`, `protestee_name` (text, nullable)
      - `race_number` (integer)
      - `incident_description` (text)
      - `rules_alleged_broken`, `witnesses` (text, nullable)
      - `hearing_time`, `hearing_location` (for scheduling)
      - `decision`, `decision_summary`, `penalty_applied` (for outcomes)
      - `decided_at`, `decided_by` (decision metadata)
      - `protest_time_limit` (timestamptz)

    - `event_scoring_enquiries` - for score review requests
      - `id` (uuid, primary key)
      - `event_id` (text)
      - `club_id` (uuid, references clubs)
      - `submitted_by_user_id`, `submitted_by_name`, `sail_number` (who)
      - `race_number` (integer)
      - `issue_type` (text: wrong_position, missing_result, wrong_penalty, other)
      - `description` (text)
      - `status` (text: pending, under_review, resolved, rejected)
      - `resolution`, `resolved_by`, `resolved_at` (outcome)

  2. Security
    - Enable RLS on both tables
    - Club members can view protests/enquiries for their events
    - Admins can manage (update/delete) protests and enquiries
    - Users can file their own protests/enquiries
*/

-- Event Protests table
CREATE TABLE IF NOT EXISTS event_protests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  protest_type text NOT NULL DEFAULT 'boat_vs_boat',
  status text NOT NULL DEFAULT 'filed',
  filed_by_user_id uuid REFERENCES auth.users(id),
  filed_by_name text NOT NULL,
  filed_by_sail_number text,
  protestee_sail_number text,
  protestee_name text,
  race_number integer NOT NULL,
  incident_description text NOT NULL,
  rules_alleged_broken text,
  witnesses text,
  hearing_time timestamptz,
  hearing_location text,
  decision text,
  decision_summary text,
  penalty_applied text,
  decided_at timestamptz,
  decided_by text,
  protest_time_limit timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_protest_type CHECK (protest_type IN ('boat_vs_boat', 'race_committee', 'redress_request', 'scoring_enquiry')),
  CONSTRAINT valid_protest_status CHECK (status IN ('filed', 'scheduled', 'heard', 'decided', 'withdrawn'))
);

ALTER TABLE event_protests ENABLE ROW LEVEL SECURITY;

-- Club members can view protests for events in their club
CREATE POLICY "Club members can view event protests"
  ON event_protests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_protests.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Users can insert their own protests
CREATE POLICY "Users can file protests"
  ON event_protests FOR INSERT
  TO authenticated
  WITH CHECK (
    filed_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_protests.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Admins can update protests (schedule hearings, record decisions)
CREATE POLICY "Admins can manage protests"
  ON event_protests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_protests.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_protests.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Admins can delete protests
CREATE POLICY "Admins can delete protests"
  ON event_protests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_protests.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Event Scoring Enquiries table
CREATE TABLE IF NOT EXISTS event_scoring_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES auth.users(id),
  submitted_by_name text NOT NULL,
  sail_number text NOT NULL,
  race_number integer NOT NULL,
  issue_type text NOT NULL DEFAULT 'other',
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resolution text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_issue_type CHECK (issue_type IN ('wrong_position', 'missing_result', 'wrong_penalty', 'other')),
  CONSTRAINT valid_enquiry_status CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected'))
);

ALTER TABLE event_scoring_enquiries ENABLE ROW LEVEL SECURITY;

-- Club members can view scoring enquiries
CREATE POLICY "Club members can view scoring enquiries"
  ON event_scoring_enquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_scoring_enquiries.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Users can submit scoring enquiries
CREATE POLICY "Users can submit scoring enquiries"
  ON event_scoring_enquiries FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_scoring_enquiries.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Admins can update scoring enquiries
CREATE POLICY "Admins can manage scoring enquiries"
  ON event_scoring_enquiries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_scoring_enquiries.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_scoring_enquiries.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Admins can delete scoring enquiries
CREATE POLICY "Admins can delete scoring enquiries"
  ON event_scoring_enquiries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = event_scoring_enquiries.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_protests_event_id ON event_protests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_protests_club_id ON event_protests(club_id);
CREATE INDEX IF NOT EXISTS idx_event_protests_status ON event_protests(status);
CREATE INDEX IF NOT EXISTS idx_event_scoring_enquiries_event_id ON event_scoring_enquiries(event_id);
CREATE INDEX IF NOT EXISTS idx_event_scoring_enquiries_club_id ON event_scoring_enquiries(club_id);
