/*
  # Create UWB Boat Tracking System

  1. New Tables
    - `uwb_tracking_configs` - Per-club UWB system configuration
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `name` (text) - friendly name for this setup
      - `coordinator_api_key` (text) - API key for the coordinator device
      - `update_frequency_hz` (integer) - position updates per second
      - `rounding_threshold_m` (decimal) - how close to a mark counts as rounded
      - `ocs_threshold_m` (decimal) - distance over start line for OCS detection
      - `auto_scoring_enabled` (boolean) - whether to auto-populate results
      - `is_active` (boolean) - whether the system is currently operational
      - `created_at`, `updated_at` (timestamptz)

    - `uwb_anchors` - Physical UWB anchor devices (mounted on buoys)
      - `id` (uuid, primary key)
      - `config_id` (uuid, foreign key to uwb_tracking_configs)
      - `anchor_id` (text) - hardware identifier
      - `name` (text) - friendly name
      - `role` (text) - mark, start_pin, start_boat, finish_pin, finish_boat, gate, spreader
      - `position_x`, `position_y` (decimal) - position in meters
      - `latitude`, `longitude` (decimal) - GPS coords
      - `battery_level` (integer), `last_seen_at` (timestamptz)
      - `is_active` (boolean), `sort_order` (integer)

    - `uwb_tags` - UWB tags assigned to boats
      - `id` (uuid, primary key)
      - `config_id` (uuid, foreign key)
      - `tag_hardware_id` (text) - hardware ID
      - `sail_number`, `skipper_name`, `boat_class` (text)
      - `member_id` (uuid, nullable)
      - `color` (text) - display color on map
      - `battery_level` (integer), `last_seen_at` (timestamptz)

    - `uwb_course_layouts` - Saved course configurations
      - `id` (uuid, primary key)
      - `config_id` (uuid, foreign key)
      - `name`, `course_type` (text)
      - `marks`, `start_line`, `finish_line` (jsonb)
      - `wind_direction_deg`, `course_distance_m` (decimal)

    - `uwb_race_sessions` - Active or recorded race tracking sessions
      - `id` (uuid, primary key)
      - `config_id`, `course_layout_id` (uuid, foreign keys)
      - `event_id` (uuid, nullable), `heat_id` (text, nullable)
      - `name`, `status` (text)
      - `started_at`, `finished_at` (timestamptz)
      - `recording_enabled`, `is_live` (boolean)
      - `viewer_count` (integer)

    - `uwb_position_data` - High-frequency boat position recordings
      - `id` (bigint, identity)
      - `session_id`, `tag_id` (uuid, foreign keys)
      - `position_x`, `position_y` (decimal)
      - `speed_mps`, `heading_deg` (decimal, nullable)
      - `recorded_at` (timestamptz)

    - `uwb_race_events` - Discrete race events (crossings, roundings, OCS)
      - `id` (uuid, primary key)
      - `session_id`, `tag_id` (uuid, foreign keys)
      - `event_type` (text) - start_crossing, finish_crossing, mark_rounding, ocs, etc.
      - `anchor_id` (uuid, nullable)
      - `position_x`, `position_y` (decimal)
      - `timestamp` (timestamptz)
      - `lap_number` (integer), `is_valid` (boolean)
      - `metadata` (jsonb)

  2. Security
    - RLS enabled on all tables
    - Super admins have full CRUD access
    - Club admins can view their own config
    - Authenticated users can view live session data

  3. Realtime
    - uwb_position_data, uwb_race_events, uwb_race_sessions added to realtime publication
*/

-- UWB Tracking Configurations (per-club setup)
CREATE TABLE IF NOT EXISTS uwb_tracking_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default UWB Setup',
  coordinator_api_key text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  update_frequency_hz integer NOT NULL DEFAULT 10,
  rounding_threshold_m decimal NOT NULL DEFAULT 2.0,
  ocs_threshold_m decimal NOT NULL DEFAULT 0.5,
  auto_scoring_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE uwb_tracking_configs ENABLE ROW LEVEL SECURITY;

-- UWB Anchors (mounted on buoys/marks)
CREATE TABLE IF NOT EXISTS uwb_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES uwb_tracking_configs(id) ON DELETE CASCADE,
  anchor_id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'mark',
  position_x decimal NOT NULL DEFAULT 0,
  position_y decimal NOT NULL DEFAULT 0,
  latitude decimal,
  longitude decimal,
  battery_level integer,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uwb_anchors_role_check CHECK (role IN ('mark', 'start_pin', 'start_boat', 'finish_pin', 'finish_boat', 'gate', 'spreader'))
);

ALTER TABLE uwb_anchors ENABLE ROW LEVEL SECURITY;

-- UWB Tags (on boats)
CREATE TABLE IF NOT EXISTS uwb_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES uwb_tracking_configs(id) ON DELETE CASCADE,
  tag_hardware_id text NOT NULL,
  sail_number text,
  skipper_name text,
  member_id uuid,
  boat_class text,
  color text NOT NULL DEFAULT '#0ea5e9',
  battery_level integer,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(config_id, tag_hardware_id)
);

ALTER TABLE uwb_tags ENABLE ROW LEVEL SECURITY;

-- Course Layouts
CREATE TABLE IF NOT EXISTS uwb_course_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES uwb_tracking_configs(id) ON DELETE CASCADE,
  name text NOT NULL,
  course_type text NOT NULL DEFAULT 'windward_leeward',
  marks jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_line jsonb NOT NULL DEFAULT '{}'::jsonb,
  finish_line jsonb NOT NULL DEFAULT '{}'::jsonb,
  wind_direction_deg decimal NOT NULL DEFAULT 0,
  course_distance_m decimal,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uwb_course_type_check CHECK (course_type IN ('windward_leeward', 'triangle', 'trapezoid', 'custom'))
);

ALTER TABLE uwb_course_layouts ENABLE ROW LEVEL SECURITY;

-- Race Sessions (active or recorded)
CREATE TABLE IF NOT EXISTS uwb_race_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES uwb_tracking_configs(id) ON DELETE CASCADE,
  course_layout_id uuid REFERENCES uwb_course_layouts(id) ON DELETE SET NULL,
  event_id uuid,
  heat_id text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'setup',
  started_at timestamptz,
  finished_at timestamptz,
  wind_speed_knots decimal,
  wind_direction_deg decimal,
  recording_enabled boolean NOT NULL DEFAULT true,
  is_live boolean NOT NULL DEFAULT false,
  viewer_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uwb_session_status_check CHECK (status IN ('setup', 'pre_start', 'racing', 'finished', 'abandoned'))
);

ALTER TABLE uwb_race_sessions ENABLE ROW LEVEL SECURITY;

-- Position Data (high-frequency boat positions)
CREATE TABLE IF NOT EXISTS uwb_position_data (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES uwb_race_sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES uwb_tags(id) ON DELETE CASCADE,
  position_x decimal NOT NULL,
  position_y decimal NOT NULL,
  speed_mps decimal,
  heading_deg decimal,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE uwb_position_data ENABLE ROW LEVEL SECURITY;

-- Race Events (crossings, roundings, OCS, etc.)
CREATE TABLE IF NOT EXISTS uwb_race_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES uwb_race_sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES uwb_tags(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  anchor_id uuid REFERENCES uwb_anchors(id) ON DELETE SET NULL,
  position_x decimal NOT NULL DEFAULT 0,
  position_y decimal NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now(),
  lap_number integer NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_valid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uwb_event_type_check CHECK (event_type IN ('start_crossing', 'finish_crossing', 'mark_rounding', 'ocs', 'dnf', 'dsq', 'recall'))
);

ALTER TABLE uwb_race_events ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_uwb_position_data_session_time ON uwb_position_data(session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_uwb_position_data_tag ON uwb_position_data(tag_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_uwb_race_events_session ON uwb_race_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_uwb_race_events_tag ON uwb_race_events(tag_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_uwb_tags_config_hardware ON uwb_tags(config_id, tag_hardware_id);
CREATE INDEX IF NOT EXISTS idx_uwb_anchors_config ON uwb_anchors(config_id);
CREATE INDEX IF NOT EXISTS idx_uwb_tracking_configs_club ON uwb_tracking_configs(club_id);
CREATE INDEX IF NOT EXISTS idx_uwb_race_sessions_config ON uwb_race_sessions(config_id, status);

-- RLS Policies

-- uwb_tracking_configs policies
CREATE POLICY "Super admins can manage all UWB configs"
  ON uwb_tracking_configs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Club admins can view their UWB config"
  ON uwb_tracking_configs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = uwb_tracking_configs.club_id
      AND user_clubs.role = 'admin'
    )
  );

-- uwb_anchors policies
CREATE POLICY "Super admins can manage all anchors"
  ON uwb_anchors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Club admins can view their anchors"
  ON uwb_anchors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uwb_tracking_configs
      JOIN user_clubs ON user_clubs.club_id = uwb_tracking_configs.club_id
      WHERE uwb_tracking_configs.id = uwb_anchors.config_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- uwb_tags policies
CREATE POLICY "Super admins can manage all tags"
  ON uwb_tags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Club admins can view their tags"
  ON uwb_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uwb_tracking_configs
      JOIN user_clubs ON user_clubs.club_id = uwb_tracking_configs.club_id
      WHERE uwb_tracking_configs.id = uwb_tags.config_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- uwb_course_layouts policies
CREATE POLICY "Super admins can manage all course layouts"
  ON uwb_course_layouts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Club admins can view their course layouts"
  ON uwb_course_layouts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uwb_tracking_configs
      JOIN user_clubs ON user_clubs.club_id = uwb_tracking_configs.club_id
      WHERE uwb_tracking_configs.id = uwb_course_layouts.config_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- uwb_race_sessions policies
CREATE POLICY "Super admins can manage all race sessions"
  ON uwb_race_sessions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Authenticated users can view live race sessions"
  ON uwb_race_sessions FOR SELECT
  TO authenticated
  USING (is_live = true OR status = 'finished');

-- uwb_position_data policies
CREATE POLICY "Super admins can manage all position data"
  ON uwb_position_data FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Authenticated users can view position data for live or finished sessions"
  ON uwb_position_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uwb_race_sessions
      WHERE uwb_race_sessions.id = uwb_position_data.session_id
      AND (uwb_race_sessions.is_live = true OR uwb_race_sessions.status = 'finished')
    )
  );

-- uwb_race_events policies
CREATE POLICY "Super admins can manage all race events"
  ON uwb_race_events FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Authenticated users can view race events for live or finished sessions"
  ON uwb_race_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM uwb_race_sessions
      WHERE uwb_race_sessions.id = uwb_race_events.session_id
      AND (uwb_race_sessions.is_live = true OR uwb_race_sessions.status = 'finished')
    )
  );

-- Enable Realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE uwb_position_data;
ALTER PUBLICATION supabase_realtime ADD TABLE uwb_race_events;
ALTER PUBLICATION supabase_realtime ADD TABLE uwb_race_sessions;
