/*
  # Initial Database Schema for Alfie Pro

  1. Core Tables
    - `clubs` - Sailing clubs/organizations
    - `quick_races` - Individual race events
    - `race_series` - Multi-race series
    - `venues` - Race locations
    - `members` - Club members
    - `user_clubs` - User-club relationships with roles
    - `invitations` - Pending club invitations

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users based on club membership
    - Proper foreign key constraints

  3. Notes
    - Uses auth.users from Supabase Auth
    - JSONB for flexible data storage
    - Timestamps with defaults
*/

-- Create enum types
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_role') THEN
    CREATE TYPE club_role AS ENUM ('admin', 'editor', 'viewer');
  END IF;
END $$;

-- Create clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT,
  logo TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_clubs junction table
CREATE TABLE IF NOT EXISTS user_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role club_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, club_id)
);

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role club_role NOT NULL DEFAULT 'editor',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create venues table
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create quick_races table
CREATE TABLE IF NOT EXISTS quick_races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  race_format TEXT NOT NULL,
  scoring_system TEXT NOT NULL,
  venue_id UUID REFERENCES venues(id),
  skippers JSONB DEFAULT '[]'::jsonb,
  race_results JSONB DEFAULT '[]'::jsonb,
  last_completed_race INTEGER DEFAULT 0,
  has_determined_initial_hcaps BOOLEAN DEFAULT false,
  is_manual_handicaps BOOLEAN DEFAULT false,
  heat_management JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create race_series table
CREATE TABLE IF NOT EXISTS race_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  series_name TEXT NOT NULL,
  race_format TEXT NOT NULL,
  scoring_system TEXT NOT NULL,
  venue_id UUID REFERENCES venues(id),
  num_races INTEGER DEFAULT 3,
  skippers JSONB DEFAULT '[]'::jsonb,
  race_results JSONB DEFAULT '[]'::jsonb,
  last_completed_race INTEGER DEFAULT 0,
  has_determined_initial_hcaps BOOLEAN DEFAULT false,
  is_manual_handicaps BOOLEAN DEFAULT false,
  heat_management JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  date_of_birth DATE,
  gender TEXT,
  membership_type TEXT,
  membership_status TEXT DEFAULT 'active',
  membership_start_date DATE,
  membership_end_date DATE,
  boats JSONB DEFAULT '[]'::jsonb,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_clubs_updated_at
  BEFORE UPDATE ON user_clubs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quick_races_updated_at
  BEFORE UPDATE ON quick_races
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_race_series_updated_at
  BEFORE UPDATE ON race_series
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clubs
CREATE POLICY "Users can view clubs they belong to"
  ON clubs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = clubs.id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create clubs"
  ON clubs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Club admins can update their clubs"
  ON clubs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = clubs.id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = clubs.id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete their clubs"
  ON clubs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = clubs.id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for user_clubs
CREATE POLICY "Users can view their own club memberships"
  ON user_clubs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Club admins can manage club memberships"
  ON user_clubs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = user_clubs.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- RLS Policies for invitations
CREATE POLICY "Users can view invitations for their clubs"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = invitations.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can create invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = invitations.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete invitations"
  ON invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = invitations.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for venues
CREATE POLICY "Club members can view their club's venues"
  ON venues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = venues.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create venues"
  ON venues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update venues"
  ON venues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete venues"
  ON venues FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for quick_races
CREATE POLICY "Club members can view their club's quick races"
  ON quick_races FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = quick_races.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create quick races"
  ON quick_races FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = quick_races.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update quick races"
  ON quick_races FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = quick_races.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = quick_races.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete quick races"
  ON quick_races FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = quick_races.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for race_series
CREATE POLICY "Club members can view their club's race series"
  ON race_series FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create race series"
  ON race_series FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update race series"
  ON race_series FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete race series"
  ON race_series FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = race_series.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- RLS Policies for members
CREATE POLICY "Club members can view their club's members"
  ON members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = members.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can create members"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = members.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins/editors can update members"
  ON members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = members.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = members.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete members"
  ON members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = members.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_clubs_user_id ON user_clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_club_id ON user_clubs(club_id);
CREATE INDEX IF NOT EXISTS idx_invitations_club_id ON invitations(club_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_venues_club_id ON venues(club_id);
CREATE INDEX IF NOT EXISTS idx_quick_races_club_id ON quick_races(club_id);
CREATE INDEX IF NOT EXISTS idx_race_series_club_id ON race_series(club_id);
CREATE INDEX IF NOT EXISTS idx_members_club_id ON members(club_id);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);