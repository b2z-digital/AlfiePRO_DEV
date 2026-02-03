/*
  # Fix System Template Update Policy

  1. Changes
    - Fix the "Super admins can update system templates" policy
    - Change from checking JWT to checking profiles table
    - The is_super_admin flag is in profiles, not in JWT

  2. Security
    - Super admins (from profiles table) can update system templates
*/

-- Drop the broken policy
DROP POLICY IF EXISTS "Super admins can update system templates" ON public.dashboard_templates;

-- Create correct policy that checks profiles table
CREATE POLICY "Super admins can update system templates"
ON public.dashboard_templates
FOR UPDATE
TO authenticated
USING (
  is_system_template = true
  AND is_editable_by_super_admin = true
  AND auth.uid() IN (
    SELECT id FROM public.profiles WHERE is_super_admin = true
  )
)
WITH CHECK (
  is_system_template = true
  AND is_editable_by_super_admin = true
  AND auth.uid() IN (
    SELECT id FROM public.profiles WHERE is_super_admin = true
  )
);
