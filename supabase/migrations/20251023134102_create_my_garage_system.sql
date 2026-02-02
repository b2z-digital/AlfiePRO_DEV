/*
  # My Garage - Complete Boat Management System
  
  1. Enhanced Tables
    - `member_boats` - Enhanced with images, specs, purchase date, value
    - `boat_images` - Multiple images per boat with primary image flag
    - `maintenance_logs` - Track all maintenance activities
    - `maintenance_reminders` - Scheduled maintenance with notifications
    - `boat_performance` - Track race performance linked to specific boats
    - `rig_settings` - Enhanced from boat_rigs with detailed measurements
    - `shared_rig_settings` - Share settings with specific members or publicly
  
  2. Security
    - Enable RLS on all tables
    - Members can only manage their own boats and data
    - Share functionality with granular permissions
  
  3. Features
    - Maintenance logging and scheduling
    - Performance tracking
    - Rig tuning per conditions
    - Social sharing of setups
*/

-- Enhanced member_boats table with additional fields
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'image_url') THEN
    ALTER TABLE member_boats ADD COLUMN image_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'description') THEN
    ALTER TABLE member_boats ADD COLUMN description text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'purchase_date') THEN
    ALTER TABLE member_boats ADD COLUMN purchase_date date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'purchase_value') THEN
    ALTER TABLE member_boats ADD COLUMN purchase_value numeric(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'specifications') THEN
    ALTER TABLE member_boats ADD COLUMN specifications jsonb DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_boats' AND column_name = 'is_primary') THEN
    ALTER TABLE member_boats ADD COLUMN is_primary boolean DEFAULT false;
  END IF;
END $$;

-- Boat Images table
CREATE TABLE IF NOT EXISTS boat_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES member_boats(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  is_primary boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Maintenance Logs table
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES member_boats(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  maintenance_type text NOT NULL, -- 'repair', 'upgrade', 'inspection', 'cleaning', 'other'
  cost numeric(10,2),
  performed_by text,
  performed_date date NOT NULL,
  next_service_date date,
  notes text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Maintenance Reminders table
CREATE TABLE IF NOT EXISTS maintenance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES member_boats(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  reminder_type text NOT NULL, -- 'time_based', 'usage_based', 'seasonal'
  due_date date,
  recurrence text, -- 'once', 'weekly', 'monthly', 'quarterly', 'annually'
  is_completed boolean DEFAULT false,
  completed_date timestamptz,
  notification_days_before integer DEFAULT 7,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Boat Performance Tracking
CREATE TABLE IF NOT EXISTS boat_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES member_boats(id) ON DELETE CASCADE,
  race_event_id text, -- Reference to race event
  race_date date NOT NULL,
  position integer,
  wind_condition text, -- 'light', 'medium', 'strong'
  water_condition text, -- 'flat', 'moderate', 'rough'
  rig_used_id uuid REFERENCES boat_rigs(id) ON DELETE SET NULL,
  notes text,
  finish_time interval,
  corrected_time interval,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced Rig Settings (boat_rigs already exists, just add columns if needed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boat_rigs' AND column_name = 'description') THEN
    ALTER TABLE boat_rigs ADD COLUMN description text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boat_rigs' AND column_name = 'is_default') THEN
    ALTER TABLE boat_rigs ADD COLUMN is_default boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boat_rigs' AND column_name = 'sail_configuration') THEN
    ALTER TABLE boat_rigs ADD COLUMN sail_configuration jsonb DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boat_rigs' AND column_name = 'times_used') THEN
    ALTER TABLE boat_rigs ADD COLUMN times_used integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boat_rigs' AND column_name = 'avg_performance_rating') THEN
    ALTER TABLE boat_rigs ADD COLUMN avg_performance_rating numeric(3,2);
  END IF;
END $$;

-- Rig Settings for different conditions (rig_conditions already exists)
-- Just enhance with detailed settings storage
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rig_conditions' AND column_name = 'notes') THEN
    ALTER TABLE rig_conditions ADD COLUMN notes text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rig_conditions' AND column_name = 'performance_rating') THEN
    ALTER TABLE rig_conditions ADD COLUMN performance_rating integer CHECK (performance_rating >= 1 AND performance_rating <= 5);
  END IF;
END $$;

-- Rig Settings Sharing (shared_rig_settings already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shared_rig_settings' AND column_name = 'shared_by_member_id') THEN
    ALTER TABLE shared_rig_settings ADD COLUMN shared_by_member_id uuid REFERENCES members(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shared_rig_settings' AND column_name = 'is_public') THEN
    ALTER TABLE shared_rig_settings ADD COLUMN is_public boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shared_rig_settings' AND column_name = 'likes_count') THEN
    ALTER TABLE shared_rig_settings ADD COLUMN likes_count integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shared_rig_settings' AND column_name = 'views_count') THEN
    ALTER TABLE shared_rig_settings ADD COLUMN views_count integer DEFAULT 0;
  END IF;
END $$;

-- Rig Settings Likes (social feature)
CREATE TABLE IF NOT EXISTS rig_settings_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_setting_id uuid NOT NULL REFERENCES shared_rig_settings(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(shared_setting_id, member_id)
);

-- Enable RLS on all tables
ALTER TABLE boat_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE boat_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rig_settings_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for boat_images
CREATE POLICY "Members can view images of their own boats"
  ON boat_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_images.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert images for their own boats"
  ON boat_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_images.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update images of their own boats"
  ON boat_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_images.boat_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_images.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete images of their own boats"
  ON boat_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_images.boat_id
      AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for maintenance_logs
CREATE POLICY "Members can view maintenance logs of their own boats"
  ON maintenance_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_logs.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert maintenance logs for their own boats"
  ON maintenance_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_logs.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update maintenance logs of their own boats"
  ON maintenance_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_logs.boat_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_logs.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete maintenance logs of their own boats"
  ON maintenance_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_logs.boat_id
      AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for maintenance_reminders (same pattern)
CREATE POLICY "Members can view reminders of their own boats"
  ON maintenance_reminders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_reminders.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert reminders for their own boats"
  ON maintenance_reminders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_reminders.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update reminders of their own boats"
  ON maintenance_reminders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_reminders.boat_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_reminders.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete reminders of their own boats"
  ON maintenance_reminders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = maintenance_reminders.boat_id
      AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for boat_performance
CREATE POLICY "Members can view performance data of their own boats"
  ON boat_performance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_performance.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert performance data for their own boats"
  ON boat_performance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_performance.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update performance data of their own boats"
  ON boat_performance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_performance.boat_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_performance.boat_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete performance data of their own boats"
  ON boat_performance FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_boats mb
      INNER JOIN members m ON m.id = mb.member_id
      WHERE mb.id = boat_performance.boat_id
      AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for rig_settings_likes
CREATE POLICY "Members can view all rig settings likes"
  ON rig_settings_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Members can like rig settings"
  ON rig_settings_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = rig_settings_likes.member_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can unlike rig settings"
  ON rig_settings_likes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = rig_settings_likes.member_id
      AND m.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_boat_images_boat_id ON boat_images(boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_images_is_primary ON boat_images(is_primary);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_boat_id ON maintenance_logs(boat_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_performed_date ON maintenance_logs(performed_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_boat_id ON maintenance_reminders(boat_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_due_date ON maintenance_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_is_active ON maintenance_reminders(is_active);
CREATE INDEX IF NOT EXISTS idx_boat_performance_boat_id ON boat_performance(boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_performance_race_date ON boat_performance(race_date DESC);
CREATE INDEX IF NOT EXISTS idx_rig_settings_likes_shared_setting_id ON rig_settings_likes(shared_setting_id);
CREATE INDEX IF NOT EXISTS idx_rig_settings_likes_member_id ON rig_settings_likes(member_id);
