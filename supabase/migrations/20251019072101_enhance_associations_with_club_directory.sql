/*
  # Enhance State/National Associations with Club Directory

  1. Changes to Existing Tables
    - Add `state_association_id` to clubs table (link clubs to their state)
    - Add `national_association_id` to state_associations (link states to national)
    - Add club directory fields to state_associations for pre-Alfie clubs
    - Add approval workflow fields to state_associations
    - Add club directory data structure to state_associations

  2. New Tables
    - state_association_clubs: Pre-Alfie club directory for state associations
    - state_association_applications: Application workflow for state associations

  3. Club Directory Fields (from screenshot)
    - Sailing Location(s)
    - Sailing Days/Times
    - Classes Sailed
    - Contact Info (email, committee positions)
    - Website
    - Map/Location data

  4. Security
    - Update RLS policies for new relationships
    - Proper access control for directory data
*/

-- Add state_association_id to clubs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE clubs ADD COLUMN state_association_id UUID REFERENCES state_associations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add national_association_id to state_associations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN national_association_id UUID REFERENCES national_associations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add approval workflow fields to state_associations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'status'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create state_association_clubs table for pre-Alfie club directory
CREATE TABLE IF NOT EXISTS state_association_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_association_id UUID NOT NULL REFERENCES state_associations(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  
  -- Basic Info
  name TEXT NOT NULL,
  short_name TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  
  -- Location Info (from screenshot)
  address TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  
  -- Sailing Info (from screenshot)
  sailing_locations JSONB DEFAULT '[]'::jsonb,
  sailing_days TEXT,
  classes_sailed TEXT[],
  
  -- Contact Info (from screenshot)
  president_name TEXT,
  president_email TEXT,
  vice_president_name TEXT,
  vice_president_email TEXT,
  secretary_name TEXT,
  secretary_email TEXT,
  treasurer_name TEXT,
  treasurer_email TEXT,
  
  -- Additional Info
  description TEXT,
  logo_url TEXT,
  featured_image_url TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create state_association_applications table
CREATE TABLE IF NOT EXISTS state_association_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE,
  
  -- Application Data
  association_name TEXT NOT NULL,
  state TEXT NOT NULL,
  abn TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  
  -- Contact Info
  address TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'Australia',
  
  -- Admin Info
  admin_name TEXT NOT NULL,
  admin_position TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  
  -- Link to created association (once approved)
  state_association_id UUID REFERENCES state_associations(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE state_association_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_association_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for state_association_clubs

-- Anyone can view active clubs in directory
CREATE POLICY "Anyone can view active clubs in directory"
  ON state_association_clubs FOR SELECT
  TO authenticated
  USING (is_active = true);

-- State admins can view all clubs in their directory
CREATE POLICY "State admins can view all their clubs"
  ON state_association_clubs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_association_clubs.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- State admins can insert clubs into their directory
CREATE POLICY "State admins can add clubs to their directory"
  ON state_association_clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_association_clubs.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- State admins can update clubs in their directory
CREATE POLICY "State admins can update their directory clubs"
  ON state_association_clubs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_association_clubs.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- State admins can delete clubs from their directory
CREATE POLICY "State admins can delete directory clubs"
  ON state_association_clubs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = state_association_clubs.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- National admins can manage all club directories
CREATE POLICY "National admins can manage all club directories"
  ON state_association_clubs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      JOIN state_associations sa ON sa.national_association_id = una.national_association_id
      WHERE sa.id = state_association_clubs.state_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- RLS Policies for state_association_applications

-- Users can view their own applications
CREATE POLICY "Users can view their own applications"
  ON state_association_applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- National admins can view all applications
CREATE POLICY "National admins can view all applications"
  ON state_association_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = state_association_applications.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- Authenticated users can submit applications
CREATE POLICY "Users can submit applications"
  ON state_association_applications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their pending applications
CREATE POLICY "Users can update their pending applications"
  ON state_association_applications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- National admins can update any application
CREATE POLICY "National admins can update applications"
  ON state_association_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = state_association_applications.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clubs_state_association 
ON clubs(state_association_id);

CREATE INDEX IF NOT EXISTS idx_state_associations_national 
ON state_associations(national_association_id);

CREATE INDEX IF NOT EXISTS idx_state_associations_status 
ON state_associations(status);

CREATE INDEX IF NOT EXISTS idx_state_association_clubs_association 
ON state_association_clubs(state_association_id);

CREATE INDEX IF NOT EXISTS idx_state_association_clubs_club 
ON state_association_clubs(club_id);

CREATE INDEX IF NOT EXISTS idx_state_association_clubs_active 
ON state_association_clubs(is_active);

CREATE INDEX IF NOT EXISTS idx_state_association_applications_user 
ON state_association_applications(user_id);

CREATE INDEX IF NOT EXISTS idx_state_association_applications_national 
ON state_association_applications(national_association_id);

CREATE INDEX IF NOT EXISTS idx_state_association_applications_status 
ON state_association_applications(status);
