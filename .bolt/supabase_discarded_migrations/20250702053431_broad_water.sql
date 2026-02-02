/*
  # Add Super Admin Role and Public Events Table

  1. New Enums
    - Add 'super_admin' to club_role enum

  2. New Tables
    - public_events: For storing state and national events

  3. Security
    - Add policies for super_admin access to clubs
    - Add policies for public events management
*/

-- Add 'super_admin' to club_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_role' AND 
                 'super_admin' = ANY(enum_range(NULL::club_role)::text[])) THEN
    ALTER TYPE club_role ADD VALUE 'super_admin';
  END IF;
END$$;

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

-- Create function to check if user is a platform super admin
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update updated_at column
CREATE TRIGGER update_public_events_updated_at
BEFORE UPDATE ON public_events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on public_events
ALTER TABLE public_events ENABLE ROW LEVEL SECURITY;

-- Public can view all public events
CREATE POLICY "Public can view all public events"
ON public_events
FOR SELECT
TO public
USING (true);

-- Super admins can delete public events
CREATE POLICY "Super admins can delete public events"
ON public_events
FOR DELETE
TO authenticated
USING (is_platform_super_admin());

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

-- Update existing policies for clubs to include super_admin access
DO $$
BEGIN
  -- Check if the policy exists before trying to drop it
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'clubs' 
    AND policyname = 'Authenticated users can view clubs'
  ) THEN
    -- Drop the existing policy
    DROP POLICY "Authenticated users can view clubs" ON clubs;
  END IF;
END$$;

-- Recreate the policy with super_admin access
CREATE POLICY "Authenticated users can view clubs"
ON clubs
FOR SELECT
TO authenticated
USING ((EXISTS ( SELECT 1
   FROM user_clubs uc
  WHERE ((uc.club_id = clubs.id) AND (uc.user_id = auth.uid())))) OR is_platform_super_admin());