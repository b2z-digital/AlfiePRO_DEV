/*
  # Create Super Admin Platform Management System

  1. New Tables
    - `platform_billing_rates`
      - `id` (uuid, primary key)
      - `name` (text) - Rate name (e.g., "Club Per-Member Fee 2026")
      - `rate_per_member` (numeric) - AUD per active member
      - `billing_target` (text) - 'club', 'state_association', 'national_association'
      - `billing_frequency` (text) - 'monthly', 'quarterly', 'annually'
      - `effective_from` (date)
      - `effective_to` (date, nullable)
      - `is_active` (boolean)
      - `notes` (text, nullable)
      - `created_at` / `updated_at` timestamps

    - `platform_billing_records`
      - `id` (uuid, primary key)
      - `billing_rate_id` (uuid) - FK to platform_billing_rates
      - `target_type` (text) - 'club', 'state_association', 'national_association'
      - `target_id` (uuid) - ID of the club/association being billed
      - `target_name` (text) - Name for display
      - `billing_period_start` (date)
      - `billing_period_end` (date)
      - `member_count` (integer) - Active members for that period
      - `rate_per_member` (numeric) - Snapshot of rate at billing time
      - `total_amount` (numeric) - Calculated total
      - `payment_status` (text) - 'pending', 'invoiced', 'paid', 'overdue', 'waived'
      - `payment_date` (timestamptz, nullable)
      - `payment_reference` (text, nullable)
      - `notes` (text, nullable)
      - `created_at` / `updated_at` timestamps

    - `platform_feature_controls`
      - `id` (uuid, primary key)
      - `feature_key` (text) - e.g. 'race_management', 'marketing', 'livestream'
      - `feature_label` (text) - Display name
      - `feature_description` (text, nullable)
      - `feature_group` (text) - Category group
      - `is_globally_enabled` (boolean) - Master toggle
      - `created_at` / `updated_at` timestamps

    - `platform_feature_overrides`
      - `id` (uuid, primary key)
      - `feature_control_id` (uuid) - FK to platform_feature_controls
      - `target_type` (text) - 'club', 'state_association', 'national_association'
      - `target_id` (uuid) - ID of the org
      - `is_enabled` (boolean) - Override: true=force on, false=force off
      - `created_by` (uuid) - Super admin who set it
      - `created_at` / `updated_at` timestamps

    - `platform_backups`
      - `id` (uuid, primary key)
      - `backup_type` (text) - 'automatic', 'manual', 'pre_migration'
      - `status` (text) - 'in_progress', 'completed', 'failed', 'restored'
      - `tables_count` (integer)
      - `rows_count` (bigint)
      - `size_bytes` (bigint)
      - `storage_location` (text, nullable)
      - `notes` (text, nullable)
      - `triggered_by` (uuid, nullable) - User who triggered manual backup
      - `completed_at` (timestamptz, nullable)
      - `created_at` timestamp

    - `platform_super_admins`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - FK to auth.users
      - `email` (text)
      - `display_name` (text)
      - `access_level` (text) - 'full', 'read_only', 'billing_only'
      - `granted_by` (uuid, nullable)
      - `is_active` (boolean)
      - `last_login_at` (timestamptz, nullable)
      - `created_at` / `updated_at` timestamps

  2. Security
    - RLS enabled on all tables
    - Only super admins can access these tables (via user_metadata check)

  3. Seed Data
    - Default feature controls for all major platform features
*/

-- Helper function to check if current user is a super admin
CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT COALESCE(
    (SELECT (raw_user_meta_data->>'is_super_admin')::boolean
     FROM auth.users
     WHERE id = auth.uid()),
    false
  );
$$;

-- Platform Billing Rates
CREATE TABLE IF NOT EXISTS public.platform_billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate_per_member numeric(10,2) NOT NULL DEFAULT 0,
  billing_target text NOT NULL CHECK (billing_target IN ('club', 'state_association', 'national_association')),
  billing_frequency text NOT NULL DEFAULT 'annually' CHECK (billing_frequency IN ('monthly', 'quarterly', 'annually')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_billing_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage billing rates"
  ON public.platform_billing_rates
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert billing rates"
  ON public.platform_billing_rates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update billing rates"
  ON public.platform_billing_rates
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can delete billing rates"
  ON public.platform_billing_rates
  FOR DELETE TO authenticated
  USING (public.is_platform_super_admin());

-- Platform Billing Records
CREATE TABLE IF NOT EXISTS public.platform_billing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_rate_id uuid REFERENCES public.platform_billing_rates(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('club', 'state_association', 'national_association')),
  target_id uuid NOT NULL,
  target_name text NOT NULL DEFAULT '',
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  rate_per_member numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'invoiced', 'paid', 'overdue', 'waived')),
  payment_date timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_billing_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage billing records"
  ON public.platform_billing_records
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert billing records"
  ON public.platform_billing_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update billing records"
  ON public.platform_billing_records
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can delete billing records"
  ON public.platform_billing_records
  FOR DELETE TO authenticated
  USING (public.is_platform_super_admin());

-- Platform Feature Controls
CREATE TABLE IF NOT EXISTS public.platform_feature_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  feature_label text NOT NULL,
  feature_description text,
  feature_group text NOT NULL DEFAULT 'general',
  is_globally_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_feature_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view feature controls"
  ON public.platform_feature_controls
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert feature controls"
  ON public.platform_feature_controls
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update feature controls"
  ON public.platform_feature_controls
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can delete feature controls"
  ON public.platform_feature_controls
  FOR DELETE TO authenticated
  USING (public.is_platform_super_admin());

-- Platform Feature Overrides (per-org)
CREATE TABLE IF NOT EXISTS public.platform_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_control_id uuid NOT NULL REFERENCES public.platform_feature_controls(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('club', 'state_association', 'national_association')),
  target_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feature_control_id, target_type, target_id)
);

ALTER TABLE public.platform_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view feature overrides"
  ON public.platform_feature_overrides
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert feature overrides"
  ON public.platform_feature_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update feature overrides"
  ON public.platform_feature_overrides
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can delete feature overrides"
  ON public.platform_feature_overrides
  FOR DELETE TO authenticated
  USING (public.is_platform_super_admin());

-- Platform Backups
CREATE TABLE IF NOT EXISTS public.platform_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL DEFAULT 'automatic' CHECK (backup_type IN ('automatic', 'manual', 'pre_migration')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'restored')),
  tables_count integer NOT NULL DEFAULT 0,
  rows_count bigint NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_location text,
  notes text,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view backups"
  ON public.platform_backups
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert backups"
  ON public.platform_backups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update backups"
  ON public.platform_backups
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

-- Platform Super Admins
CREATE TABLE IF NOT EXISTS public.platform_super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  access_level text NOT NULL DEFAULT 'full' CHECK (access_level IN ('full', 'read_only', 'billing_only')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.platform_super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view super admin list"
  ON public.platform_super_admins
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can insert super admins"
  ON public.platform_super_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can update super admins"
  ON public.platform_super_admins
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Super admins can delete super admins"
  ON public.platform_super_admins
  FOR DELETE TO authenticated
  USING (public.is_platform_super_admin());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_billing_records_target ON public.platform_billing_records(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_billing_records_status ON public.platform_billing_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_platform_billing_records_period ON public.platform_billing_records(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_platform_feature_overrides_target ON public.platform_feature_overrides(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_feature_controls_key ON public.platform_feature_controls(feature_key);
CREATE INDEX IF NOT EXISTS idx_platform_super_admins_user ON public.platform_super_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_backups_status ON public.platform_backups(status);

-- Seed default feature controls
INSERT INTO public.platform_feature_controls (feature_key, feature_label, feature_description, feature_group, is_globally_enabled)
VALUES
  ('race_management', 'Race Management', 'Race scoring, series management, and results', 'racing', true),
  ('race_calendar', 'Race Calendar', 'Event calendar and scheduling', 'racing', true),
  ('results_display', 'Results Display', 'Public results and leaderboards', 'racing', true),
  ('hms_validator', 'HMS Validator', 'Handicap Management System validation tools', 'racing', true),
  ('yacht_classes', 'Yacht Classes', 'Boat class management and specifications', 'racing', true),
  ('venues', 'Venues', 'Venue management and details', 'racing', true),
  ('live_tracking', 'Live Tracking', 'Real-time race tracking and GPS', 'racing', true),
  ('news', 'News & Articles', 'News publishing and article management', 'content', true),
  ('media', 'Media Library', 'Photo and video media management', 'content', true),
  ('alfie_tv', 'AlfieTV', 'Video streaming and channel management', 'content', true),
  ('livestream', 'Livestream', 'Live video broadcasting', 'content', true),
  ('marketing', 'Marketing', 'Email campaigns and marketing automation', 'communications', true),
  ('community', 'Community', 'Social features, groups, and discussions', 'communications', true),
  ('classifieds', 'Classifieds', 'Buy/sell marketplace', 'tools', true),
  ('resources', 'Resources', 'Document library and resource management', 'tools', true),
  ('weather', 'Weather', 'Weather forecasts and conditions', 'tools', true),
  ('boat_shed', 'Boat Shed (My Garage)', 'Personal boat management and tuning', 'tools', true),
  ('website_builder', 'Website Builder', 'Public website and page builder', 'website', true),
  ('event_websites', 'Event Websites', 'Dedicated event website creation', 'website', true),
  ('membership_management', 'Membership Management', 'Member registration, renewals, and fees', 'membership', true),
  ('finance', 'Finance & Accounting', 'Financial tracking, invoicing, and reports', 'finance', true),
  ('meetings', 'Meetings', 'Meeting scheduling, minutes, and agenda management', 'operations', true),
  ('tasks', 'Tasks', 'Task management and assignment', 'operations', true),
  ('documents', 'Document Templates', 'NOR, SI, and document generation', 'operations', true),
  ('advertising', 'Advertising', 'Banner ads and campaign management', 'monetization', true)
ON CONFLICT (feature_key) DO NOTHING;

-- Seed the existing super admin (Stephen Walsh)
INSERT INTO public.platform_super_admins (user_id, email, display_name, access_level, is_active)
SELECT 
  id,
  email,
  'Stephen Walsh',
  'full',
  true
FROM auth.users
WHERE email = 'stephen@b2z.com.au'
ON CONFLICT (user_id) DO NOTHING;
