/*
  # Standalone Race Management System v2

  1. New Tables
    - `shared_results` - Shareable links for race results
    - `external_organizations` - Organizations to share results with

  2. New Columns
    - `profiles.race_management_plan` (text)

  3. Security
    - RLS on both new tables
    - Owner-based access control
    - Anonymous view access for public shares

  4. Functions
    - `activate_race_officer_mode` - Self-service activation
    - `increment_shared_result_views` - View counter
*/

-- Add race_management_plan column to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'race_management_plan'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN race_management_plan text DEFAULT 'free';
  END IF;
END $$;

-- Create shared_results table if not exists
CREATE TABLE IF NOT EXISTS public.shared_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  title text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  recipients jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shared_results' AND policyname = 'Users can manage own shared results') THEN
    CREATE POLICY "Users can manage own shared results"
      ON public.shared_results FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shared_results' AND policyname = 'Anyone can view public shared results') THEN
    CREATE POLICY "Anyone can view public shared results"
      ON public.shared_results FOR SELECT TO anon
      USING (is_public = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shared_results' AND policyname = 'Authenticated can view public shared results') THEN
    CREATE POLICY "Authenticated can view public shared results"
      ON public.shared_results FOR SELECT TO authenticated
      USING (is_public = true);
  END IF;
END $$;

-- Create external_organizations table if not exists
CREATE TABLE IF NOT EXISTS public.external_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  abbreviation text DEFAULT '',
  contact_email text DEFAULT '',
  contact_name text DEFAULT '',
  org_type text DEFAULT 'other',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'external_organizations' AND policyname = 'Users can manage own external organizations') THEN
    CREATE POLICY "Users can manage own external organizations"
      ON public.external_organizations FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_shared_results_share_token ON public.shared_results(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_results_user_id ON public.shared_results(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_results_event_id ON public.shared_results(event_id);
CREATE INDEX IF NOT EXISTS idx_external_organizations_user_id ON public.external_organizations(user_id);

-- Drop and recreate activate_race_officer_mode to fix return type
DROP FUNCTION IF EXISTS public.activate_race_officer_mode(text);

CREATE OR REPLACE FUNCTION public.activate_race_officer_mode(p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name = COALESCE(NULLIF(p_display_name, ''), full_name),
    is_race_officer = true,
    onboarding_completed = true,
    race_management_plan = 'free'
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, full_name, is_race_officer, onboarding_completed, race_management_plan)
    VALUES (auth.uid(), p_display_name, true, true, 'free');
  END IF;
END;
$$;

-- Drop and recreate increment_shared_result_views
DROP FUNCTION IF EXISTS public.increment_shared_result_views(text);

CREATE OR REPLACE FUNCTION public.increment_shared_result_views(p_share_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_results
  SET view_count = view_count + 1
  WHERE share_token = p_share_token AND is_public = true;
END;
$$;
