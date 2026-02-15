/*
  # Allow Platform-Level Integrations

  1. Modified Tables
    - `integrations`
      - Modify constraint to allow all organization IDs to be NULL for platform-level integrations
      - Add index for platform-level integrations

  2. Security Updates
    - Add RLS policy for super admins to manage platform integrations

  3. Notes
    - Platform-level integrations are owned by AlfiePRO (e.g., default YouTube, Stripe)
    - Only super admins can manage these integrations
*/

-- Drop the old constraint that required at least one organization ID
ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_org_check;

-- Add new constraint that allows all NULL for platform-level integrations
ALTER TABLE public.integrations ADD CONSTRAINT integrations_org_check CHECK (
  -- Allow all NULL for platform-level integrations
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
  -- Or exactly one org ID must be set
  (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
  (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL)
);

-- Create unique constraint for platform-level integrations (one per platform)
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_platform_level
  ON public.integrations(platform)
  WHERE club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL;

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE((auth.jwt()->>'user_metadata')::jsonb->>'is_super_admin', 'false')::boolean
  );
END;
$$;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view integrations they have access to" ON public.integrations;
DROP POLICY IF EXISTS "Admins can manage integrations" ON public.integrations;

-- Add RLS policy for users to view integrations they have access to OR super admins to view all
CREATE POLICY "Users can view integrations they have access to"
  ON public.integrations
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR
    check_integration_access(integrations)
  );

-- Add RLS policy for admins and super admins to manage integrations
CREATE POLICY "Admins can manage integrations"
  ON public.integrations
  FOR ALL
  TO authenticated
  USING (
    (is_super_admin() AND (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL)) OR
    check_integration_admin_access(integrations)
  )
  WITH CHECK (
    (is_super_admin() AND (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL)) OR
    check_integration_admin_access(integrations)
  );

-- Update existing default YouTube integration to be platform-level if it exists
UPDATE public.integrations
SET 
  club_id = NULL,
  state_association_id = NULL,
  national_association_id = NULL
WHERE is_default = true
  AND platform = 'youtube';
