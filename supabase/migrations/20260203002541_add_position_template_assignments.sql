/*
  # Position-Based Dashboard Template System

  1. Changes
    - Add `is_system_template` flag to dashboard_templates (for super admin editing)
    - Add `is_editable_by_super_admin` flag to dashboard_templates
    - Add `dashboard_template_id` to committee_position_definitions
    - Add `position_priority` to committee_position_definitions (for resolving conflicts when user has multiple positions)
    - Add index for efficient template lookups

  2. Purpose
    - Allow super admins to configure default templates
    - Assign templates to committee positions
    - Automatically apply templates when users are assigned to positions

  3. Security
    - Only super admins can edit system templates
    - Templates are applied on first login or position assignment
    - Users can still customize their dashboard after template is applied
*/

-- Add flags to dashboard templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'dashboard_templates'
    AND column_name = 'is_system_template'
  ) THEN
    ALTER TABLE public.dashboard_templates
    ADD COLUMN is_system_template boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'dashboard_templates'
    AND column_name = 'is_editable_by_super_admin'
  ) THEN
    ALTER TABLE public.dashboard_templates
    ADD COLUMN is_editable_by_super_admin boolean DEFAULT false;
  END IF;
END $$;

-- Mark existing default templates as system templates (editable by super admin)
UPDATE public.dashboard_templates
SET is_system_template = true,
    is_editable_by_super_admin = true
WHERE name IN (
  'Race Management',
  'Finance Management',
  'Membership Management',
  'Club Secretary',
  'Full Overview'
);

-- Add template assignment to committee positions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'committee_position_definitions'
    AND column_name = 'dashboard_template_id'
  ) THEN
    ALTER TABLE public.committee_position_definitions
    ADD COLUMN dashboard_template_id uuid REFERENCES public.dashboard_templates(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'committee_position_definitions'
    AND column_name = 'position_priority'
  ) THEN
    ALTER TABLE public.committee_position_definitions
    ADD COLUMN position_priority integer DEFAULT 50;
  END IF;
END $$;

-- Add helpful comment
COMMENT ON COLUMN public.committee_position_definitions.position_priority IS
'Priority for determining which template to apply when user has multiple positions. Higher number = higher priority. Range: 0-100.';

COMMENT ON COLUMN public.committee_position_definitions.dashboard_template_id IS
'Dashboard template automatically applied when a member is assigned to this position';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_committee_positions_template
ON public.committee_position_definitions(dashboard_template_id)
WHERE dashboard_template_id IS NOT NULL;

-- Create index for priority sorting
CREATE INDEX IF NOT EXISTS idx_committee_positions_priority
ON public.committee_position_definitions(position_priority DESC);

-- Set default priorities for common positions (higher = more important)
UPDATE public.committee_position_definitions
SET position_priority = CASE
  WHEN LOWER(position_name) LIKE '%commodore%' OR LOWER(position_name) LIKE '%president%' THEN 100
  WHEN LOWER(position_name) LIKE '%vice%' THEN 90
  WHEN LOWER(position_name) LIKE '%treasurer%' THEN 85
  WHEN LOWER(position_name) LIKE '%secretary%' THEN 85
  WHEN LOWER(position_name) LIKE '%race%officer%' OR LOWER(position_name) LIKE '%sailing%coordinator%' THEN 80
  WHEN LOWER(position_name) LIKE '%membership%' THEN 75
  ELSE 50
END
WHERE position_priority = 50;

-- Add RLS policy for super admin template editing
DROP POLICY IF EXISTS "Super admins can update system templates" ON public.dashboard_templates;
CREATE POLICY "Super admins can update system templates"
ON public.dashboard_templates
FOR UPDATE
TO authenticated
USING (
  is_system_template = true
  AND is_editable_by_super_admin = true
  AND (auth.jwt()->>'is_super_admin')::boolean = true
)
WITH CHECK (
  is_system_template = true
  AND is_editable_by_super_admin = true
  AND (auth.jwt()->>'is_super_admin')::boolean = true
);