/*
  # Create Scoring Checkpoints System

  A robust checkpoint/rollback system for race scoring. Automatically saves
  a full snapshot of the scoring state at the end of each completed round,
  allowing race officers to roll back to any previous state if errors occur.

  1. New Tables
    - `scoring_checkpoints`
      - `id` (uuid, primary key)
      - `event_id` (text, references the quick_race or series round)
      - `club_id` (uuid, references clubs)
      - `round_number` (integer, which round was just completed)
      - `checkpoint_type` (text: 'auto_round_complete' or 'manual')
      - `label` (text, human-readable label e.g. "End of Round 3")
      - `heat_management` (jsonb, full HeatManagement snapshot)
      - `race_results` (jsonb, full raceResults array snapshot)
      - `skippers` (jsonb, full skippers array snapshot)
      - `last_completed_race` (integer)
      - `drop_rules` (jsonb)
      - `num_races` (integer)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references auth.users)

  2. Security
    - Enable RLS on `scoring_checkpoints` table
    - Club admins can create, read, and delete checkpoints for their events
    - Members can read checkpoints for events in their club

  3. Important Notes
    - Checkpoints are immutable once created (no UPDATE policy)
    - Auto-checkpoints created at end of each completed round
    - Manual checkpoints can be created at any time by the race officer
    - Restoring a checkpoint replaces the current scoring state
*/

-- Create the scoring_checkpoints table
CREATE TABLE IF NOT EXISTS scoring_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  checkpoint_type text NOT NULL DEFAULT 'auto_round_complete',
  label text NOT NULL,
  heat_management jsonb NOT NULL,
  race_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  skippers jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_completed_race integer NOT NULL DEFAULT 0,
  drop_rules jsonb NOT NULL DEFAULT '[4, 8, 16, 24, 32, 40]'::jsonb,
  num_races integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Index for efficient lookups by event
CREATE INDEX IF NOT EXISTS idx_scoring_checkpoints_event_id 
  ON scoring_checkpoints(event_id);

-- Index for ordering by round within an event
CREATE INDEX IF NOT EXISTS idx_scoring_checkpoints_event_round 
  ON scoring_checkpoints(event_id, round_number DESC);

-- Enable RLS
ALTER TABLE scoring_checkpoints ENABLE ROW LEVEL SECURITY;

-- Club admins and editors can create checkpoints
CREATE POLICY "Club admins can create scoring checkpoints"
  ON scoring_checkpoints FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = scoring_checkpoints.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Club members can view checkpoints for their club's events
CREATE POLICY "Club members can view scoring checkpoints"
  ON scoring_checkpoints FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = scoring_checkpoints.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Club admins can delete checkpoints (cleanup old data)
CREATE POLICY "Club admins can delete scoring checkpoints"
  ON scoring_checkpoints FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = scoring_checkpoints.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );
