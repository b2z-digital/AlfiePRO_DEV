/*
  # Super Admin and Public Events Schema

  1. New Tables
    - `public_events` - Stores public events that are visible to all users
  
  2. Security
    - Add super_admin role to club_role enum
    - Add is_platform_super_admin() function
    - Add policies for super admins to manage public events
*/

-- Add super_admin to club_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'club_role') THEN
    CREATE TYPE club_role AS ENUM ('super_admin', 'admin', 'editor', 'member');
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'club_role' AND e.enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE club_role ADD VALUE 'super_admin';
  END IF;
END$$;

-- Create is_platform_super_admin function
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_clubs
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Add RLS to public_events
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

-- Create trigger to update updated_at column
CREATE TRIGGER update_public_events_updated_at
  BEFORE UPDATE ON public_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();