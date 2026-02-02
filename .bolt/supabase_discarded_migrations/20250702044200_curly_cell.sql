/*
  # Super Admin and Public Events Schema
  
  1. Changes
    - Add 'super_admin' to club_role enum
    - Create public_events table for State and National events
    - Add is_platform_super_admin() function
    - Update RLS policies to allow super_admin access
    
  2. Notes
    - Enables platform-wide super admin role
    - Creates separate storage for public events
    - Maintains proper access control
*/

-- Add 'super_admin' to the club_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'super_admin'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'club_role')
  ) THEN
    ALTER TYPE club_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- Create public_events table
CREATE TABLE IF NOT EXISTS public_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  date TEXT NOT NULL,
  end_date TEXT,
  venue TEXT NOT NULL,
  race_class TEXT NOT NULL,
  race_format TEXT NOT NULL,
  notice_of_race_url TEXT,
  sailing_instructions_url TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  entry_fee NUMERIC,
  media JSONB DEFAULT '[]'::jsonb,
  livestream_url TEXT,
  is_interclub BOOLEAN DEFAULT FALSE,
  other_club_name TEXT,
  multi_day BOOLEAN DEFAULT FALSE,
  number_of_days INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) for public_events
ALTER TABLE public_events ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is a platform super admin
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = auth.uid()
    AND role = 'super_admin'::club_role
  );
$$;

-- RLS Policies for public_events

-- Public can view all public events
CREATE POLICY "Public can view all public events"
  ON public_events
  FOR SELECT
  TO public
  USING (true);

-- Super admins can insert public events
CREATE POLICY "Super admins can insert public events"
  ON public_events
  FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_super_admin());

-- Super admins can update public events
CREATE POLICY "Super admins can update public events"
  ON public_events
  FOR UPDATE
  TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Super admins can delete public events
CREATE POLICY "Super admins can delete public events"
  ON public_events
  FOR DELETE
  TO authenticated
  USING (is_platform_super_admin());

-- Trigger to update 'updated_at' timestamp
CREATE TRIGGER update_public_events_updated_at
  BEFORE UPDATE ON public_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update RLS Policies for clubs table to allow super_admin access
DROP POLICY IF EXISTS "Users can view clubs they are members of" ON clubs;
DROP POLICY IF EXISTS "Club admins can update club details" ON clubs;
DROP POLICY IF EXISTS "Club admins can delete clubs" ON clubs;

-- SELECT policy for authenticated users (members of a club OR super admin)
CREATE POLICY "Authenticated users can view clubs"
ON clubs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
  ) OR is_platform_super_admin() -- Super admin can see all clubs
);

-- UPDATE policy (admins of a club OR super admin)
CREATE POLICY "Admins or Super Admins can update club details"
ON clubs
FOR UPDATE
TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )) OR is_platform_super_admin() -- Super admin can update any club
)
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )) OR is_platform_super_admin() -- Super admin can update any club
);

-- DELETE policy (admins of a club OR super admin)
CREATE POLICY "Admins or Super Admins can delete clubs"
ON clubs
FOR DELETE
TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )) OR is_platform_super_admin() -- Super admin can delete any club
);

-- Update RLS Policies for user_clubs table
DROP POLICY IF EXISTS "Users can view own memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can view all club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can add club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can update club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Admins can delete club memberships" ON user_clubs;
DROP POLICY IF EXISTS "Users can insert their own club associations" ON user_clubs;
DROP POLICY IF EXISTS "Service role has full access" ON user_clubs;

-- SELECT policy for authenticated users (user's own memberships OR super admin OR club admin)
CREATE POLICY "Authenticated users can view user_clubs"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() -- User can see their own memberships
    OR is_platform_super_admin() -- Super admin can see all user_clubs entries
    OR is_club_admin(club_id) -- Club admin can see user_clubs for their club
  );

-- INSERT policy (club admin OR super admin OR user inserting their own association)
CREATE POLICY "Admins or Super Admins can insert user_clubs"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_club_admin(club_id) -- Club admin can insert for their club
    OR is_platform_super_admin() -- Super admin can insert for any club
    OR auth.uid() = user_id -- User can insert their own association (for club creation)
  );

-- UPDATE policy (club admin OR super admin)
CREATE POLICY "Admins or Super Admins can update user_clubs"
  ON user_clubs
  FOR UPDATE
  TO authenticated
  USING (
    is_club_admin(club_id) -- Club admin can update for their club
    OR is_platform_super_admin() -- Super admin can update for any club
  )
  WITH CHECK (
    is_club_admin(club_id) -- Club admin can update for their club
    OR is_platform_super_admin() -- Super admin can update for any club
  );

-- DELETE policy (club admin OR super admin)
CREATE POLICY "Admins or Super Admins can delete user_clubs"
  ON user_clubs
  FOR DELETE
  TO authenticated
  USING (
    is_club_admin(club_id) -- Club admin can delete for their club
    OR is_platform_super_admin() -- Super admin can delete for any club
  );

-- Service role policy for full access
CREATE POLICY "Service role has full access"
  ON user_clubs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update RLS policies for other tables to allow super_admin access
-- This is a template for other tables - apply similar pattern to all tables with club_id

-- Example for committee_positions
DROP POLICY IF EXISTS "Club admins can manage committee positions" ON committee_positions;
CREATE POLICY "Admins or Super Admins can manage committee positions"
ON committee_positions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = committee_positions.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  ) OR is_platform_super_admin()
);

-- Example for members
DROP POLICY IF EXISTS "Club admins can manage members" ON members;
CREATE POLICY "Admins or Super Admins can manage members"
ON members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = members.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  ) OR is_platform_super_admin()
);

-- Example for venues
DROP POLICY IF EXISTS "Club members can manage venues" ON venues;
CREATE POLICY "Club members or Super Admins can manage venues"
ON venues
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = venues.club_id
    AND uc.user_id = auth.uid()
  ) OR is_platform_super_admin()
);

-- Example for quick_races
DROP POLICY IF EXISTS "Club members can manage races" ON quick_races;
CREATE POLICY "Club members or Super Admins can manage races"
ON quick_races
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = quick_races.club_id
    AND uc.user_id = auth.uid()
  ) OR is_platform_super_admin()
);

-- Example for race_series
DROP POLICY IF EXISTS "Club members can manage series" ON race_series;
CREATE POLICY "Club members or Super Admins can manage series"
ON race_series
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = race_series.club_id
    AND uc.user_id = auth.uid()
  ) OR is_platform_super_admin()
);