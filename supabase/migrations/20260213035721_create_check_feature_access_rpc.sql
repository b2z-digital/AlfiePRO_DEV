/*
  # Create Feature Access Check RPC

  1. New Functions
    - `check_feature_access(p_feature_key, p_org_id, p_org_type)` - Returns whether a feature is enabled for a specific organization
    - `get_org_feature_flags(p_org_id, p_org_type)` - Returns all feature flags with effective states for an organization

  2. Security
    - Both functions use SECURITY DEFINER to bypass RLS on platform_feature_controls/overrides
    - Accessible by any authenticated user
    - Read-only access to feature flag states

  3. Important Notes
    - These functions allow the application to check feature access without needing super admin privileges
    - Override logic: if an override exists for the org, use override state; otherwise use global state
*/

CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key text,
  p_org_id uuid,
  p_org_type text DEFAULT 'club'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_global_enabled boolean;
  v_override_enabled boolean;
BEGIN
  SELECT id, is_globally_enabled
  INTO v_feature_id, v_global_enabled
  FROM public.platform_feature_controls
  WHERE feature_key = p_feature_key;

  IF v_feature_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT is_enabled
  INTO v_override_enabled
  FROM public.platform_feature_overrides
  WHERE feature_control_id = v_feature_id
    AND target_type = p_org_type
    AND target_id = p_org_id;

  IF v_override_enabled IS NOT NULL THEN
    RETURN v_override_enabled;
  END IF;

  RETURN v_global_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_feature_flags(
  p_org_id uuid,
  p_org_type text DEFAULT 'club'
)
RETURNS TABLE (
  feature_key text,
  feature_label text,
  feature_group text,
  is_enabled boolean,
  has_override boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.feature_key,
    fc.feature_label,
    fc.feature_group,
    COALESCE(fo.is_enabled, fc.is_globally_enabled) AS is_enabled,
    (fo.id IS NOT NULL) AS has_override
  FROM public.platform_feature_controls fc
  LEFT JOIN public.platform_feature_overrides fo
    ON fo.feature_control_id = fc.id
    AND fo.target_type = p_org_type
    AND fo.target_id = p_org_id
  ORDER BY fc.feature_group, fc.feature_label;
END;
$$;
