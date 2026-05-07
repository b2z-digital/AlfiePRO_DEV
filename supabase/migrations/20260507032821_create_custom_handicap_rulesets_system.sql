/*
  # Create Custom Handicap Rulesets System

  1. New Tables
    - `handicap_rulesets`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `name` (text) - User-friendly name e.g. "Sprint Series Rules"
      - `description` (text) - Plain English description of how the rules work
      - `is_default` (boolean) - Whether this is the system default (AlfiePRO rules)
      - `is_active` (boolean) - Whether this ruleset is available for use
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `handicap_seeding_rules`
      - `id` (uuid, primary key)
      - `ruleset_id` (uuid, references handicap_rulesets)
      - `method` (text) - 'position_based', 'fixed_value', 'fleet_average'
      - `base_value` (integer) - Starting value (e.g. 0 for first place)
      - `increment_per_position` (integer) - e.g. 10 seconds per position
      - `description` (text) - Plain English description

    - `handicap_adjustment_rules`
      - `id` (uuid, primary key)
      - `ruleset_id` (uuid, references handicap_rulesets)
      - `priority` (integer) - Order of evaluation (lower = first)
      - `name` (text) - Rule name e.g. "Winner adjustment"
      - `condition_type` (text) - 'position', 'position_range', 'streak', 'scratch_boat', 'last_place'
      - `condition_value` (jsonb) - Condition parameters
      - `action` (text) - 'add', 'subtract', 'set', 'no_change'
      - `action_value` (integer) - Seconds to add/subtract/set
      - `applies_to` (text) - 'self', 'all_others', 'non_scratch', 'scratch_only'
      - `description` (text) - Plain English description

    - `handicap_ruleset_config`
      - `id` (uuid, primary key)
      - `ruleset_id` (uuid, references handicap_rulesets)
      - `cap_limit` (integer, default 150) - Maximum handicap allowed
      - `last_place_bonus_enabled` (boolean, default false)
      - `last_place_bonus_value` (integer, default 30)
      - `scratch_boat_win_bonus` (integer, default 30) - Bonus when scratch boat wins
      - `scratch_streak_threshold` (integer, default 3) - Consecutive last places before bonus
      - `scratch_streak_bonus` (integer, default 30)

    - `handicap_ruleset_tests`
      - `id` (uuid, primary key)
      - `ruleset_id` (uuid, references handicap_rulesets)
      - `test_name` (text)
      - `test_data` (jsonb) - Input data for simulation
      - `expected_results` (jsonb) - Expected output
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Club admins can manage their own rulesets
    - All authenticated users can view rulesets for their club
    - System default rulesets are viewable by all authenticated users

  3. Notes
    - This is a standalone system not yet integrated with live handicap scoring
    - The system default ruleset represents the current hardcoded AlfiePRO rules
    - Clubs can create, test, and refine rulesets before they are integrated
*/

-- Handicap Rulesets (main table)
CREATE TABLE IF NOT EXISTS handicap_rulesets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE handicap_rulesets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rulesets for their club"
  ON handicap_rulesets FOR SELECT
  TO authenticated
  USING (
    club_id IS NULL
    OR is_default = true
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can insert rulesets"
  ON handicap_rulesets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update their rulesets"
  ON handicap_rulesets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete their rulesets"
  ON handicap_rulesets FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- Handicap Seeding Rules
CREATE TABLE IF NOT EXISTS handicap_seeding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL REFERENCES handicap_rulesets(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'position_based',
  base_value integer NOT NULL DEFAULT 0,
  increment_per_position integer NOT NULL DEFAULT 10,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE handicap_seeding_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view seeding rules for accessible rulesets"
  ON handicap_seeding_rules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      WHERE hr.id = handicap_seeding_rules.ruleset_id
      AND (
        hr.club_id IS NULL
        OR hr.is_default = true
        OR EXISTS (
          SELECT 1 FROM user_clubs
          WHERE user_clubs.club_id = hr.club_id
          AND user_clubs.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Club admins can manage seeding rules"
  ON handicap_seeding_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update seeding rules"
  ON handicap_seeding_rules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete seeding rules"
  ON handicap_seeding_rules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Handicap Adjustment Rules
CREATE TABLE IF NOT EXISTS handicap_adjustment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL REFERENCES handicap_rulesets(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  condition_type text NOT NULL,
  condition_value jsonb NOT NULL DEFAULT '{}',
  action text NOT NULL DEFAULT 'add',
  action_value integer NOT NULL DEFAULT 0,
  applies_to text NOT NULL DEFAULT 'self',
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE handicap_adjustment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view adjustment rules for accessible rulesets"
  ON handicap_adjustment_rules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      WHERE hr.id = handicap_adjustment_rules.ruleset_id
      AND (
        hr.club_id IS NULL
        OR hr.is_default = true
        OR EXISTS (
          SELECT 1 FROM user_clubs
          WHERE user_clubs.club_id = hr.club_id
          AND user_clubs.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Club admins can manage adjustment rules"
  ON handicap_adjustment_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update adjustment rules"
  ON handicap_adjustment_rules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete adjustment rules"
  ON handicap_adjustment_rules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Handicap Ruleset Config (global settings for a ruleset)
CREATE TABLE IF NOT EXISTS handicap_ruleset_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL UNIQUE REFERENCES handicap_rulesets(id) ON DELETE CASCADE,
  cap_limit integer NOT NULL DEFAULT 150,
  last_place_bonus_enabled boolean NOT NULL DEFAULT false,
  last_place_bonus_value integer NOT NULL DEFAULT 30,
  scratch_boat_win_bonus integer NOT NULL DEFAULT 30,
  scratch_streak_threshold integer NOT NULL DEFAULT 3,
  scratch_streak_bonus integer NOT NULL DEFAULT 30,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE handicap_ruleset_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view config for accessible rulesets"
  ON handicap_ruleset_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      WHERE hr.id = handicap_ruleset_config.ruleset_id
      AND (
        hr.club_id IS NULL
        OR hr.is_default = true
        OR EXISTS (
          SELECT 1 FROM user_clubs
          WHERE user_clubs.club_id = hr.club_id
          AND user_clubs.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Club admins can manage config"
  ON handicap_ruleset_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update config"
  ON handicap_ruleset_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete config"
  ON handicap_ruleset_config FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Handicap Ruleset Tests (simulation data)
CREATE TABLE IF NOT EXISTS handicap_ruleset_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL REFERENCES handicap_rulesets(id) ON DELETE CASCADE,
  test_name text NOT NULL DEFAULT 'Untitled Test',
  test_data jsonb NOT NULL DEFAULT '{}',
  expected_results jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE handicap_ruleset_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tests for accessible rulesets"
  ON handicap_ruleset_tests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      WHERE hr.id = handicap_ruleset_tests.ruleset_id
      AND (
        hr.club_id IS NULL
        OR hr.is_default = true
        OR EXISTS (
          SELECT 1 FROM user_clubs
          WHERE user_clubs.club_id = hr.club_id
          AND user_clubs.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Club admins can manage tests"
  ON handicap_ruleset_tests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_tests.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update tests"
  ON handicap_ruleset_tests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_tests.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_tests.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete tests"
  ON handicap_ruleset_tests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM handicap_rulesets hr
      JOIN user_clubs uc ON uc.club_id = hr.club_id
      WHERE hr.id = handicap_ruleset_tests.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_handicap_rulesets_club_id ON handicap_rulesets(club_id);
CREATE INDEX IF NOT EXISTS idx_handicap_seeding_rules_ruleset_id ON handicap_seeding_rules(ruleset_id);
CREATE INDEX IF NOT EXISTS idx_handicap_adjustment_rules_ruleset_id ON handicap_adjustment_rules(ruleset_id);
CREATE INDEX IF NOT EXISTS idx_handicap_adjustment_rules_priority ON handicap_adjustment_rules(ruleset_id, priority);
CREATE INDEX IF NOT EXISTS idx_handicap_ruleset_tests_ruleset_id ON handicap_ruleset_tests(ruleset_id);