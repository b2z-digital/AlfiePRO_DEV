-- PRO Rostering System
-- Allows clubs to roster Principal Race Officers for sailing days

-- Main roster container
CREATE TABLE IF NOT EXISTS pro_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id text NOT NULL,
  name text NOT NULL,
  description text,
  boat_class text NOT NULL,
  series_id text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  allocation_method text NOT NULL DEFAULT 'fair_random' CHECK (allocation_method IN ('fair_random', 'manual', 'round_robin')),
  reminder_days_before integer NOT NULL DEFAULT 7,
  reminder_type text NOT NULL DEFAULT 'both' CHECK (reminder_type IN ('email', 'notification', 'both')),
  allow_decline boolean NOT NULL DEFAULT true,
  max_consecutive integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Individual rounds/sailing days within a roster
CREATE TABLE IF NOT EXISTS pro_roster_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES pro_rosters(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text,
  series_round_id text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Member assignments to roster rounds
CREATE TABLE IF NOT EXISTS pro_roster_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES pro_rosters(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES pro_roster_rounds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'declined', 'swapped', 'completed')),
  task_id text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  swap_member_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Member exclusion dates (holidays, unavailability)
CREATE TABLE IF NOT EXISTS pro_roster_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES pro_rosters(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  exclusion_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Eligible members for a roster
CREATE TABLE IF NOT EXISTS pro_roster_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES pro_rosters(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  duty_count integer NOT NULL DEFAULT 0,
  last_duty_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(roster_id, member_id)
);

-- Indexes
CREATE INDEX idx_pro_rosters_club_id ON pro_rosters(club_id);
CREATE INDEX idx_pro_rosters_status ON pro_rosters(status);
CREATE INDEX idx_pro_roster_rounds_roster_id ON pro_roster_rounds(roster_id);
CREATE INDEX idx_pro_roster_rounds_date ON pro_roster_rounds(date);
CREATE INDEX idx_pro_roster_assignments_roster_id ON pro_roster_assignments(roster_id);
CREATE INDEX idx_pro_roster_assignments_round_id ON pro_roster_assignments(round_id);
CREATE INDEX idx_pro_roster_assignments_member_id ON pro_roster_assignments(member_id);
CREATE INDEX idx_pro_roster_exclusions_roster_id ON pro_roster_exclusions(roster_id);
CREATE INDEX idx_pro_roster_members_roster_id ON pro_roster_members(roster_id);

-- Enable RLS
ALTER TABLE pro_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_roster_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_roster_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_roster_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_roster_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pro_rosters
CREATE POLICY "select_pro_rosters" ON pro_rosters FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_pro_rosters" ON pro_rosters FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_pro_rosters" ON pro_rosters FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pro_rosters" ON pro_rosters FOR DELETE
  TO authenticated USING (true);

-- RLS Policies for pro_roster_rounds
CREATE POLICY "select_pro_roster_rounds" ON pro_roster_rounds FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_pro_roster_rounds" ON pro_roster_rounds FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_pro_roster_rounds" ON pro_roster_rounds FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pro_roster_rounds" ON pro_roster_rounds FOR DELETE
  TO authenticated USING (true);

-- RLS Policies for pro_roster_assignments
CREATE POLICY "select_pro_roster_assignments" ON pro_roster_assignments FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_pro_roster_assignments" ON pro_roster_assignments FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_pro_roster_assignments" ON pro_roster_assignments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pro_roster_assignments" ON pro_roster_assignments FOR DELETE
  TO authenticated USING (true);

-- RLS Policies for pro_roster_exclusions
CREATE POLICY "select_pro_roster_exclusions" ON pro_roster_exclusions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_pro_roster_exclusions" ON pro_roster_exclusions FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_pro_roster_exclusions" ON pro_roster_exclusions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pro_roster_exclusions" ON pro_roster_exclusions FOR DELETE
  TO authenticated USING (true);

-- RLS Policies for pro_roster_members
CREATE POLICY "select_pro_roster_members" ON pro_roster_members FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_pro_roster_members" ON pro_roster_members FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_pro_roster_members" ON pro_roster_members FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_pro_roster_members" ON pro_roster_members FOR DELETE
  TO authenticated USING (true);
