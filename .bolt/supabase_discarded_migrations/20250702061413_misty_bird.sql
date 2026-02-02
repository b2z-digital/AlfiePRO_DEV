/*
  # Public Events and Super Admin Migration

  1. New Tables
    - `public_events` - For storing public/state/national events
      - `id` (uuid, primary key)
      - `event_name` (text)
      - `date` (text)
      - `end_date` (text, nullable)
      - `venue` (text)
      - `race_class` (text)
      - `race_format` (text)
      - Various other event fields
  
  2. Security
    - Add 'super_admin' to club_role enum
    - Create is_platform_super_admin() function
    - Enable RLS on public_events table
    - Add policies for public events
*/

-- Add super_admin to club_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'club_role' AND e.enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'super_admin';
  END IF;
END$$;

-- Create is_platform_super_admin function if it doesn't exist
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create is_club_admin function if it doesn't exist
CREATE OR REPLACE FUNCTION is_club_admin(club_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = auth.uid() 
    AND club_id = $1
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create public_events table if it doesn't exist
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
  is_paid BOOLEAN DEFAULT false,
  entry_fee NUMERIC,
  media JSONB DEFAULT '[]'::jsonb,
  livestream_url TEXT,
  is_interclub BOOLEAN DEFAULT false,
  other_club_name TEXT,
  multi_day BOOLEAN DEFAULT false,
  number_of_days INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS to public_events if not already enabled
ALTER TABLE public_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid errors
DROP POLICY IF EXISTS "Public can view all public events" ON public_events;
DROP POLICY IF EXISTS "Super admins can delete public events" ON public_events;
DROP POLICY IF EXISTS "Super admins can insert public events" ON public_events;
DROP POLICY IF EXISTS "Super admins can update public events" ON public_events;

-- Create policies for public_events
CREATE POLICY "Public can view all public events"
  ON public_events
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Super admins can delete public events"
  ON public_events
  FOR DELETE
  TO authenticated
  USING (is_platform_super_admin());

CREATE POLICY "Super admins can insert public events"
  ON public_events
  FOR INSERT
  TO authenticated
  WITH CHECK (is_platform_super_admin());

CREATE POLICY "Super admins can update public events"
  ON public_events
  FOR UPDATE
  TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS update_public_events_updated_at ON public_events;
CREATE TRIGGER update_public_events_updated_at
  BEFORE UPDATE ON public_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update RLS policies for other tables to allow super_admin access
-- Example for clubs
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;
CREATE POLICY "Authenticated users can view clubs"
ON clubs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = id
    AND uc.user_id = auth.uid()
  ) OR is_platform_super_admin()
);

-- Example for members
DROP POLICY IF EXISTS "Admins or Super Admins can manage members" ON members;
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
DROP POLICY IF EXISTS "Club members or Super Admins can manage venues" ON venues;
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
DROP POLICY IF EXISTS "Club members or Super Admins can manage races" ON quick_races;
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
DROP POLICY IF EXISTS "Club members or Super Admins can manage series" ON race_series;
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