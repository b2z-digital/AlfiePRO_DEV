/*
  # Create National Rankings System

  1. New Tables
    - `national_rankings`
      - Stores ranking data for each yacht class from national association
      - Includes rank, skipper name, points, state, etc.
    - `skipper_name_mappings`
      - Maps ranking names to actual member records
      - Stores verified mappings for future use
    - `ranking_sync_logs`
      - Tracks sync history and any errors
    
  2. Security
    - Enable RLS on all tables
    - National admins can manage rankings for their association
    - All users can view rankings
    - Only verified mappings can be created/updated by admins
*/

-- National Rankings Table
CREATE TABLE IF NOT EXISTS national_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_association_id uuid NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  boat_class_id uuid REFERENCES boat_classes(id) ON DELETE SET NULL,
  yacht_class_name text NOT NULL,
  rank integer NOT NULL,
  skipper_name text NOT NULL,
  normalized_name text NOT NULL,
  sail_number text,
  state text,
  points numeric,
  events_counted integer,
  source_url text,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(national_association_id, yacht_class_name, rank)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_national_rankings_association ON national_rankings(national_association_id);
CREATE INDEX IF NOT EXISTS idx_national_rankings_class ON national_rankings(boat_class_id);
CREATE INDEX IF NOT EXISTS idx_national_rankings_normalized_name ON national_rankings(normalized_name);

-- Skipper Name Mappings Table
CREATE TABLE IF NOT EXISTS skipper_name_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_association_id uuid NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  ranking_id uuid REFERENCES national_rankings(id) ON DELETE CASCADE,
  ranking_name text NOT NULL,
  normalized_ranking_name text NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  yacht_class_name text,
  verified boolean DEFAULT false,
  match_confidence numeric DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(national_association_id, normalized_ranking_name, yacht_class_name)
);

CREATE INDEX IF NOT EXISTS idx_mappings_association ON skipper_name_mappings(national_association_id);
CREATE INDEX IF NOT EXISTS idx_mappings_member ON skipper_name_mappings(member_id);
CREATE INDEX IF NOT EXISTS idx_mappings_normalized ON skipper_name_mappings(normalized_ranking_name);

-- Ranking Sync Logs
CREATE TABLE IF NOT EXISTS ranking_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_association_id uuid NOT NULL REFERENCES national_associations(id) ON DELETE CASCADE,
  yacht_class_name text NOT NULL,
  source_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  rankings_imported integer DEFAULT 0,
  error_message text,
  initiated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_association ON ranking_sync_logs(national_association_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON ranking_sync_logs(created_at DESC);

-- Enable RLS
ALTER TABLE national_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE skipper_name_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for national_rankings

-- Anyone can view rankings
CREATE POLICY "Anyone can view rankings"
  ON national_rankings FOR SELECT
  TO authenticated
  USING (true);

-- National admins can insert rankings for their association
CREATE POLICY "National admins can insert rankings"
  ON national_rankings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- National admins can update rankings for their association
CREATE POLICY "National admins can update rankings"
  ON national_rankings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- National admins can delete rankings
CREATE POLICY "National admins can delete rankings"
  ON national_rankings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- RLS Policies for skipper_name_mappings

-- Anyone can view mappings
CREATE POLICY "Anyone can view mappings"
  ON skipper_name_mappings FOR SELECT
  TO authenticated
  USING (true);

-- National admins can manage mappings
CREATE POLICY "National admins can insert mappings"
  ON skipper_name_mappings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can update mappings"
  ON skipper_name_mappings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

CREATE POLICY "National admins can delete mappings"
  ON skipper_name_mappings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- RLS Policies for ranking_sync_logs

-- National admins can view their sync logs
CREATE POLICY "National admins can view sync logs"
  ON ranking_sync_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- National admins can insert sync logs
CREATE POLICY "National admins can insert sync logs"
  ON ranking_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = national_association_id
      AND uc.role = 'national_admin'
    )
  );

-- Function to normalize names for matching
CREATE OR REPLACE FUNCTION normalize_name(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(regexp_replace(trim(name), '\s+', ' ', 'g'));
END;
$$;

-- Trigger to auto-update normalized_name on insert/update
CREATE OR REPLACE FUNCTION update_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_name := normalize_name(NEW.skipper_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_normalized_name
  BEFORE INSERT OR UPDATE OF skipper_name
  ON national_rankings
  FOR EACH ROW
  EXECUTE FUNCTION update_normalized_name();

-- Trigger to auto-update normalized_ranking_name
CREATE OR REPLACE FUNCTION update_normalized_ranking_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_ranking_name := normalize_name(NEW.ranking_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_normalized_ranking_name
  BEFORE INSERT OR UPDATE OF ranking_name
  ON skipper_name_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_normalized_ranking_name();