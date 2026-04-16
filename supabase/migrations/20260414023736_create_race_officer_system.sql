/*
  # Create Independent Race Officer System

  1. Profile Changes
    - Add `is_race_officer` boolean flag to `profiles` table
    - This allows users to operate as race officers independently of any club membership

  2. New Tables
    - `race_officer_contacts` - Local contacts/skippers that race officers can save and reuse across events
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users) - the race officer who owns this contact
      - `name` (text) - skipper/competitor name
      - `sail_number` (text) - sail number
      - `boat_class` (text) - boat class
      - `boat_name` (text) - boat name
      - `club_name` (text) - optional club affiliation
      - `email` (text) - optional email
      - `phone` (text) - optional phone
      - `notes` (text) - optional notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  3. Race Table Changes
    - Add `user_id` column to `quick_races` to support race officer owned events (no club_id)
    - Add `user_id` column to `race_series` to support race officer owned series

  4. Security
    - Enable RLS on `race_officer_contacts` table
    - Race officers can only access their own contacts
    - Race officers can create/read/update/delete events they own via user_id
    - Add RLS policies for user_id scoped quick_races and race_series
*/

-- Add is_race_officer flag to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_race_officer'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_race_officer boolean DEFAULT false;
  END IF;
END $$;

-- Add user_id to quick_races for race officer owned events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.quick_races ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add user_id to race_series for race officer owned series
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.race_series ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Create race_officer_contacts table
CREATE TABLE IF NOT EXISTS public.race_officer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sail_number text DEFAULT '',
  boat_class text DEFAULT '',
  boat_name text DEFAULT '',
  club_name text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  notes text DEFAULT '',
  country text DEFAULT '',
  state text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_race_officer_contacts_user_id ON public.race_officer_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_races_user_id ON public.quick_races(user_id);
CREATE INDEX IF NOT EXISTS idx_race_series_user_id ON public.race_series(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_race_officer ON public.profiles(is_race_officer) WHERE is_race_officer = true;

-- Enable RLS on race_officer_contacts
ALTER TABLE public.race_officer_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for race_officer_contacts
CREATE POLICY "Race officers can view own contacts"
  ON public.race_officer_contacts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Race officers can insert own contacts"
  ON public.race_officer_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Race officers can update own contacts"
  ON public.race_officer_contacts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Race officers can delete own contacts"
  ON public.race_officer_contacts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add RLS policy for quick_races: race officers can see their own user_id scoped events
CREATE POLICY "Race officers can view own events"
  ON public.quick_races
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can insert own events"
  ON public.quick_races
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can update own events"
  ON public.quick_races
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can delete own events"
  ON public.quick_races
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL);

-- Add RLS policy for race_series: race officers can manage their own series
CREATE POLICY "Race officers can view own series"
  ON public.race_series
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can insert own series"
  ON public.race_series
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can update own series"
  ON public.race_series
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL)
  WITH CHECK (user_id = auth.uid() AND club_id IS NULL);

CREATE POLICY "Race officers can delete own series"
  ON public.race_series
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND club_id IS NULL);

-- Super admins can manage all race officer contacts
CREATE POLICY "Super admins can view all race officer contacts"
  ON public.race_officer_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create updated_at trigger for race_officer_contacts
CREATE OR REPLACE FUNCTION public.update_race_officer_contacts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_race_officer_contacts_updated_at_trigger'
  ) THEN
    CREATE TRIGGER update_race_officer_contacts_updated_at_trigger
      BEFORE UPDATE ON public.race_officer_contacts
      FOR EACH ROW
      EXECUTE FUNCTION public.update_race_officer_contacts_updated_at();
  END IF;
END $$;
