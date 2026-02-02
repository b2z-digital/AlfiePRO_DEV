/*
  # User Management Schema for SaaS Platform
  
  1. New Tables
    - `user_clubs` - Junction table for users and clubs with role management
    - `invitations` - Table for storing pending invitations
    
  2. Changes to Existing Tables
    - Add `created_by_user_id` to `clubs` table
    - Modify `club_name` to `club_id` in `quick_races` and `race_series`
    
  3. Security
    - Update RLS policies for multi-tenant access
    - Add policies for invitation management
*/

-- Create enum for club roles
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_role') THEN
    CREATE TYPE club_role AS ENUM ('admin', 'editor');
  END IF;
END $$;

-- Add created_by_user_id to clubs table
ALTER TABLE clubs 
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);

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

-- Add club_id to quick_races and race_series
-- First, add the column without constraints
ALTER TABLE quick_races 
ADD COLUMN IF NOT EXISTS club_id UUID;

ALTER TABLE race_series 
ADD COLUMN IF NOT EXISTS club_id UUID;

-- Create trigger function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_clubs_updated_at
BEFORE UPDATE ON user_clubs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at
BEFORE UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE user_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_clubs
CREATE POLICY "Users can view their own club memberships"
ON user_clubs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Club admins can manage club memberships"
ON user_clubs
FOR ALL
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
CREATE POLICY "Club admins can view invitations"
ON invitations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = invitations.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

CREATE POLICY "Club admins can create invitations"
ON invitations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = invitations.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

CREATE POLICY "Club admins can delete invitations"
ON invitations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = invitations.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

-- Update RLS policies for clubs
DROP POLICY IF EXISTS "Enable read access for everyone" ON clubs;
DROP POLICY IF EXISTS "Allow authenticated insert" ON clubs;
DROP POLICY IF EXISTS "Authenticated write access" ON clubs;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON clubs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON clubs;
DROP POLICY IF EXISTS "Enable read access for all users" ON clubs;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON clubs;
DROP POLICY IF EXISTS "Public read access" ON clubs;

-- New club policies
CREATE POLICY "Users can view clubs they are members of"
ON clubs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Public can view basic club info"
ON clubs
FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can create clubs"
ON clubs
FOR INSERT
TO authenticated
WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Club admins can update club details"
ON clubs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

CREATE POLICY "Club admins can delete clubs"
ON clubs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

-- Update RLS policies for committee_positions
DROP POLICY IF EXISTS "Enable read access for everyone" ON committee_positions;
DROP POLICY IF EXISTS "Allow authenticated insert" ON committee_positions;
DROP POLICY IF EXISTS "Authenticated write access" ON committee_positions;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON committee_positions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON committee_positions;
DROP POLICY IF EXISTS "Enable read access for all users" ON committee_positions;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON committee_positions;
DROP POLICY IF EXISTS "Public read access" ON committee_positions;

CREATE POLICY "Users can view committee positions for their clubs"
ON committee_positions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = committee_positions.club_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Public can view committee positions"
ON committee_positions
FOR SELECT
TO public
USING (true);

CREATE POLICY "Club admins can manage committee positions"
ON committee_positions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = committee_positions.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

-- Update RLS policies for members
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable read access for all users" ON members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON members;

-- Add club_id to members table
ALTER TABLE members
ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);

CREATE POLICY "Users can view members of their clubs"
ON members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = members.club_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Club members can manage members"
ON members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = members.club_id
    AND uc.user_id = auth.uid()
  )
);

-- Update RLS policies for venues
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON venues;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON venues;
DROP POLICY IF EXISTS "Enable read access for all users" ON venues;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON venues;

-- Add club_id to venues table
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);

CREATE POLICY "Users can view venues of their clubs"
ON venues
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = venues.club_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Public can view venues"
ON venues
FOR SELECT
TO public
USING (true);

CREATE POLICY "Club members can manage venues"
ON venues
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = venues.club_id
    AND uc.user_id = auth.uid()
  )
);

-- Update RLS policies for quick_races
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON quick_races;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON quick_races;
DROP POLICY IF EXISTS "Enable read access for everyone" ON quick_races;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON quick_races;

CREATE POLICY "Users can view races of their clubs"
ON quick_races
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = quick_races.club_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Public can view races"
ON quick_races
FOR SELECT
TO public
USING (true);

CREATE POLICY "Club members can manage races"
ON quick_races
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = quick_races.club_id
    AND uc.user_id = auth.uid()
  )
);

-- Update RLS policies for race_series
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON race_series;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON race_series;
DROP POLICY IF EXISTS "Enable read access for all users" ON race_series;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON race_series;

CREATE POLICY "Users can view series of their clubs"
ON race_series
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = race_series.club_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Public can view series"
ON race_series
FOR SELECT
TO public
USING (true);

CREATE POLICY "Club members can manage series"
ON race_series
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = race_series.club_id
    AND uc.user_id = auth.uid()
  )
);

-- Create function to automatically add user as admin when creating a club
CREATE OR REPLACE FUNCTION add_club_creator_as_admin()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_clubs (user_id, club_id, role)
  VALUES (NEW.created_by_user_id, NEW.id, 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to add club creator as admin
DROP TRIGGER IF EXISTS add_club_creator_as_admin_trigger ON clubs;
CREATE TRIGGER add_club_creator_as_admin_trigger
AFTER INSERT ON clubs
FOR EACH ROW
WHEN (NEW.created_by_user_id IS NOT NULL)
EXECUTE FUNCTION add_club_creator_as_admin();

-- Create function to generate invitation tokens
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..32 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to set invitation expiry
CREATE OR REPLACE FUNCTION set_invitation_expiry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at := now() + interval '7 days';
  NEW.token := generate_invitation_token();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set invitation expiry
DROP TRIGGER IF EXISTS set_invitation_expiry_trigger ON invitations;
CREATE TRIGGER set_invitation_expiry_trigger
BEFORE INSERT ON invitations
FOR EACH ROW
EXECUTE FUNCTION set_invitation_expiry();