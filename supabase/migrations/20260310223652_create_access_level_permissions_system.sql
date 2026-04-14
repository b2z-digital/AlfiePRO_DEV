/*
  # Create Access Level Permissions System

  1. New Tables
    - `access_level_permission_templates`
      - Super Admin managed default permission templates
      - Maps (access_level, feature_key) to a capability
      - Serves as fallback when no org-specific override exists
    - `access_level_permissions`
      - Organization-specific permission overrides
      - Scoped to club, state_association, or national_association
      - Maps (scope, access_level, feature_key) to a capability

  2. New Function
    - `get_user_feature_capabilities` RPC
      - Returns effective capabilities for a user in a given scope
      - Fallback chain: org-specific -> template default -> hardcoded default

  3. Security
    - RLS enabled on both tables
    - Templates: all authenticated can read, only super admins can modify
    - Permissions: org members can read, org admins can modify

  4. Notes
    - Capabilities: 'none', 'view', 'edit', 'full'
    - Access levels: 'admin', 'editor', 'viewer'
    - Does NOT change any existing permissions or RLS policies
*/

-- Templates table (Super Admin managed defaults)
CREATE TABLE IF NOT EXISTS public.access_level_permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'editor', 'viewer')),
  feature_key TEXT NOT NULL,
  capability TEXT NOT NULL DEFAULT 'none' CHECK (capability IN ('none', 'view', 'edit', 'full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(access_level, feature_key)
);

ALTER TABLE access_level_permission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permission templates"
  ON access_level_permission_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert permission templates"
  ON access_level_permission_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update permission templates"
  ON access_level_permission_templates
  FOR UPDATE
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete permission templates"
  ON access_level_permission_templates
  FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Organization-specific permissions table
CREATE TABLE IF NOT EXISTS public.access_level_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE,
  national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'editor', 'viewer')),
  feature_key TEXT NOT NULL,
  capability TEXT NOT NULL DEFAULT 'none' CHECK (capability IN ('none', 'view', 'edit', 'full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exactly_one_scope CHECK (
    (club_id IS NOT NULL)::int +
    (state_association_id IS NOT NULL)::int +
    (national_association_id IS NOT NULL)::int = 1
  )
);

ALTER TABLE access_level_permissions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alp_club_unique
  ON access_level_permissions(club_id, access_level, feature_key)
  WHERE club_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alp_state_unique
  ON access_level_permissions(state_association_id, access_level, feature_key)
  WHERE state_association_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alp_national_unique
  ON access_level_permissions(national_association_id, access_level, feature_key)
  WHERE national_association_id IS NOT NULL;

-- RLS for access_level_permissions: SELECT
CREATE POLICY "Club members can view club access level permissions"
  ON access_level_permissions
  FOR SELECT
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc WHERE uc.club_id = access_level_permissions.club_id AND uc.user_id = auth.uid()
    ))
    OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa WHERE usa.state_association_id = access_level_permissions.state_association_id AND usa.user_id = auth.uid()
    ))
    OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una WHERE una.national_association_id = access_level_permissions.national_association_id AND una.user_id = auth.uid()
    ))
    OR is_super_admin(auth.uid())
  );

-- RLS for access_level_permissions: INSERT
CREATE POLICY "Admins can insert access level permissions"
  ON access_level_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc WHERE uc.club_id = access_level_permissions.club_id AND uc.user_id = auth.uid() AND uc.role = 'admin'
    ))
    OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa WHERE usa.state_association_id = access_level_permissions.state_association_id AND usa.user_id = auth.uid() AND usa.role IN ('state_admin', 'admin')
    ))
    OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una WHERE una.national_association_id = access_level_permissions.national_association_id AND una.user_id = auth.uid() AND una.role IN ('national_admin', 'admin')
    ))
    OR is_super_admin(auth.uid())
  );

-- RLS for access_level_permissions: UPDATE
CREATE POLICY "Admins can update access level permissions"
  ON access_level_permissions
  FOR UPDATE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc WHERE uc.club_id = access_level_permissions.club_id AND uc.user_id = auth.uid() AND uc.role = 'admin'
    ))
    OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa WHERE usa.state_association_id = access_level_permissions.state_association_id AND usa.user_id = auth.uid() AND usa.role IN ('state_admin', 'admin')
    ))
    OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una WHERE una.national_association_id = access_level_permissions.national_association_id AND una.user_id = auth.uid() AND una.role IN ('national_admin', 'admin')
    ))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc WHERE uc.club_id = access_level_permissions.club_id AND uc.user_id = auth.uid() AND uc.role = 'admin'
    ))
    OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa WHERE usa.state_association_id = access_level_permissions.state_association_id AND usa.user_id = auth.uid() AND usa.role IN ('state_admin', 'admin')
    ))
    OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una WHERE una.national_association_id = access_level_permissions.national_association_id AND una.user_id = auth.uid() AND una.role IN ('national_admin', 'admin')
    ))
    OR is_super_admin(auth.uid())
  );

-- RLS for access_level_permissions: DELETE
CREATE POLICY "Admins can delete access level permissions"
  ON access_level_permissions
  FOR DELETE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc WHERE uc.club_id = access_level_permissions.club_id AND uc.user_id = auth.uid() AND uc.role = 'admin'
    ))
    OR
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations usa WHERE usa.state_association_id = access_level_permissions.state_association_id AND usa.user_id = auth.uid() AND usa.role IN ('state_admin', 'admin')
    ))
    OR
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations una WHERE una.national_association_id = access_level_permissions.national_association_id AND una.user_id = auth.uid() AND una.role IN ('national_admin', 'admin')
    ))
    OR is_super_admin(auth.uid())
  );

-- RPC to get effective capabilities for a user
CREATE OR REPLACE FUNCTION public.get_user_feature_capabilities(
  p_user_id UUID,
  p_scope_type TEXT,
  p_scope_id UUID
)
RETURNS TABLE (
  feature_key TEXT,
  capability TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_access_level TEXT;
BEGIN
  IF p_scope_type = 'club' THEN
    SELECT
      CASE uc.role
        WHEN 'admin' THEN 'admin'
        WHEN 'super_admin' THEN 'admin'
        WHEN 'state_admin' THEN 'admin'
        WHEN 'national_admin' THEN 'admin'
        WHEN 'editor' THEN 'editor'
        WHEN 'pro' THEN 'editor'
        ELSE 'viewer'
      END INTO v_effective_access_level
    FROM user_clubs uc
    WHERE uc.user_id = p_user_id AND uc.club_id = p_scope_id;

  ELSIF p_scope_type = 'state_association' THEN
    SELECT
      CASE usa.role
        WHEN 'state_admin' THEN 'admin'
        WHEN 'admin' THEN 'admin'
        WHEN 'editor' THEN 'editor'
        ELSE 'viewer'
      END INTO v_effective_access_level
    FROM user_state_associations usa
    WHERE usa.user_id = p_user_id AND usa.state_association_id = p_scope_id;

  ELSIF p_scope_type = 'national_association' THEN
    SELECT
      CASE una.role
        WHEN 'national_admin' THEN 'admin'
        WHEN 'admin' THEN 'admin'
        WHEN 'editor' THEN 'editor'
        ELSE 'viewer'
      END INTO v_effective_access_level
    FROM user_national_associations una
    WHERE una.user_id = p_user_id AND una.national_association_id = p_scope_id;
  END IF;

  IF is_super_admin(p_user_id) THEN
    v_effective_access_level := 'admin';
  END IF;

  IF v_effective_access_level IS NULL THEN
    v_effective_access_level := 'viewer';
  END IF;

  RETURN QUERY
  SELECT
    pfc.feature_key,
    COALESCE(
      CASE p_scope_type
        WHEN 'club' THEN (
          SELECT alp.capability FROM access_level_permissions alp
          WHERE alp.club_id = p_scope_id
            AND alp.access_level = v_effective_access_level
            AND alp.feature_key = pfc.feature_key
        )
        WHEN 'state_association' THEN (
          SELECT alp.capability FROM access_level_permissions alp
          WHERE alp.state_association_id = p_scope_id
            AND alp.access_level = v_effective_access_level
            AND alp.feature_key = pfc.feature_key
        )
        WHEN 'national_association' THEN (
          SELECT alp.capability FROM access_level_permissions alp
          WHERE alp.national_association_id = p_scope_id
            AND alp.access_level = v_effective_access_level
            AND alp.feature_key = pfc.feature_key
        )
      END,
      (SELECT alpt.capability FROM access_level_permission_templates alpt
       WHERE alpt.access_level = v_effective_access_level
         AND alpt.feature_key = pfc.feature_key),
      CASE v_effective_access_level
        WHEN 'admin' THEN 'full'
        WHEN 'editor' THEN 'edit'
        WHEN 'viewer' THEN 'view'
        ELSE 'none'
      END
    )::TEXT AS capability
  FROM platform_feature_controls pfc;
END;
$$;

NOTIFY pgrst, 'reload schema';