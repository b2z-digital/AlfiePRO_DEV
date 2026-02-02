/*
  # Dashboard Templates System

  1. New Tables
    - `dashboard_templates`
      - `id` (uuid, primary key)
      - `name` (text) - Template name
      - `description` (text) - Template description
      - `icon` (text) - Icon name
      - `is_default` (boolean) - Whether this is a default system template
      - `is_public` (boolean) - Whether this template can be used by other clubs
      - `template_data` (jsonb) - The complete dashboard configuration
      - `club_id` (uuid, nullable) - If null, it's a system template; if set, it's a club-specific template
      - `created_by` (uuid) - User who created the template
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `dashboard_templates` table
    - SuperAdmins can manage default templates
    - Club admins can create and manage their own club templates
    - All authenticated users can view default and public templates
*/

-- Create dashboard_templates table
CREATE TABLE IF NOT EXISTS dashboard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text DEFAULT 'LayoutGrid',
  is_default boolean DEFAULT false,
  is_public boolean DEFAULT false,
  template_data jsonb NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_club_id ON dashboard_templates(club_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_is_default ON dashboard_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_created_by ON dashboard_templates(created_by);

-- Enable RLS
ALTER TABLE dashboard_templates ENABLE ROW LEVEL SECURITY;

-- SuperAdmins can manage default templates
CREATE POLICY "SuperAdmins can manage default templates"
  ON dashboard_templates
  FOR ALL
  TO authenticated
  USING (
    is_default = true 
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE is_super_admin = true
    )
  )
  WITH CHECK (
    is_default = true 
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE is_super_admin = true
    )
  );

-- Club admins can manage their club templates
CREATE POLICY "Club admins can manage club templates"
  ON dashboard_templates
  FOR ALL
  TO authenticated
  USING (
    club_id IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM public.user_clubs 
      WHERE club_id = dashboard_templates.club_id 
      AND role = 'admin'
    )
  )
  WITH CHECK (
    club_id IS NOT NULL
    AND auth.uid() IN (
      SELECT user_id FROM public.user_clubs 
      WHERE club_id = dashboard_templates.club_id 
      AND role = 'admin'
    )
  );

-- All authenticated users can view default and public templates
CREATE POLICY "Users can view default and public templates"
  ON dashboard_templates
  FOR SELECT
  TO authenticated
  USING (
    is_default = true 
    OR is_public = true
    OR (
      club_id IS NOT NULL
      AND auth.uid() IN (
        SELECT user_id FROM public.user_clubs 
        WHERE club_id = dashboard_templates.club_id
      )
    )
  );

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_dashboard_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Create trigger
DROP TRIGGER IF EXISTS update_dashboard_templates_updated_at ON dashboard_templates;
CREATE TRIGGER update_dashboard_templates_updated_at
  BEFORE UPDATE ON dashboard_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_templates_updated_at();