/*
  # Extend Resources System to Clubs and Add Google Drive Integration

  1. Changes
    - Rename tables to be organization-agnostic (resource_categories, resources)
    - Add 'club' as an organization type
    - Add 'google_drive' as a resource type
    - Add Google Drive integration fields
    - Add sync fields for Google Drive
    - Create unified RLS policies for all organization types
    - Add Google Drive fields to club_integrations table

  2. Security
    - Club admins can manage their resources
    - Association admins can still manage their resources
    - Public resources viewable by anyone

  3. Storage
    - Reuse existing 'association-resources' bucket
    - Google Drive files don't use storage bucket
*/

-- Step 1: Rename existing tables (preserve data)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'association_resource_categories') THEN
    ALTER TABLE association_resource_categories RENAME TO resource_categories;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'association_resources') THEN
    ALTER TABLE association_resources RENAME TO resources;
  END IF;
END $$;

-- Step 2: Rename columns first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resource_categories' AND column_name = 'association_type'
  ) THEN
    ALTER TABLE resource_categories RENAME COLUMN association_type TO organization_type;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resource_categories' AND column_name = 'association_id'
  ) THEN
    ALTER TABLE resource_categories RENAME COLUMN association_id TO organization_id;
  END IF;
END $$;

-- Step 3: Update constraints
ALTER TABLE resource_categories DROP CONSTRAINT IF EXISTS association_resource_categories_association_type_check;
ALTER TABLE resource_categories DROP CONSTRAINT IF EXISTS resource_categories_organization_type_check;
ALTER TABLE resource_categories ADD CONSTRAINT resource_categories_organization_type_check
  CHECK (organization_type IN ('club', 'state', 'national'));

-- Step 4: Add Google Drive fields to resources table
ALTER TABLE resources ADD COLUMN IF NOT EXISTS google_drive_file_id text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS google_drive_folder_id text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS google_account_email text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'not_synced';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS sync_error_message text;

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_sync_status_check;
ALTER TABLE resources ADD CONSTRAINT resources_sync_status_check
  CHECK (sync_status IN ('synced', 'pending', 'error', 'not_synced'));

-- Step 5: Update resource_type constraint
ALTER TABLE resources DROP CONSTRAINT IF EXISTS association_resources_resource_type_check;
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_resource_type_check;
ALTER TABLE resources ADD CONSTRAINT resources_resource_type_check
  CHECK (resource_type IN ('page', 'file', 'link', 'external_tool', 'google_drive'));

-- Step 6: Add Google Drive fields to club_integrations
ALTER TABLE club_integrations ADD COLUMN IF NOT EXISTS google_drive_refresh_token text;
ALTER TABLE club_integrations ADD COLUMN IF NOT EXISTS google_drive_access_token text;
ALTER TABLE club_integrations ADD COLUMN IF NOT EXISTS google_drive_token_expiry timestamptz;
ALTER TABLE club_integrations ADD COLUMN IF NOT EXISTS google_drive_folder_id text;
ALTER TABLE club_integrations ADD COLUMN IF NOT EXISTS google_drive_sync_enabled boolean DEFAULT false;

-- Step 7: Update indexes
DROP INDEX IF EXISTS idx_resource_categories_association;
CREATE INDEX IF NOT EXISTS idx_resource_categories_organization
  ON resource_categories(organization_id, organization_type);

-- Step 8: Drop old RLS policies
DROP POLICY IF EXISTS "Association admins can view their categories" ON resource_categories;
DROP POLICY IF EXISTS "Association admins can create categories" ON resource_categories;
DROP POLICY IF EXISTS "Association admins can update their categories" ON resource_categories;
DROP POLICY IF EXISTS "Association admins can delete their categories" ON resource_categories;
DROP POLICY IF EXISTS "Anyone can view public resources" ON resources;
DROP POLICY IF EXISTS "Association admins can view all their resources" ON resources;
DROP POLICY IF EXISTS "Association admins can create resources" ON resources;
DROP POLICY IF EXISTS "Association admins can update their resources" ON resources;
DROP POLICY IF EXISTS "Association admins can delete their resources" ON resources;
DROP POLICY IF EXISTS "Organization admins can view their categories" ON resource_categories;
DROP POLICY IF EXISTS "Organization admins can create categories" ON resource_categories;
DROP POLICY IF EXISTS "Organization admins can update their categories" ON resource_categories;
DROP POLICY IF EXISTS "Organization admins can delete their categories" ON resource_categories;
DROP POLICY IF EXISTS "Organization admins can view all their resources" ON resources;
DROP POLICY IF EXISTS "Organization admins can create resources" ON resources;
DROP POLICY IF EXISTS "Organization admins can update their resources" ON resources;
DROP POLICY IF EXISTS "Organization admins can delete their resources" ON resources;
DROP POLICY IF EXISTS "Club members can view public club resources" ON resources;

-- Step 9: Create unified RLS policies
CREATE POLICY "Organization admins can view their categories"
  ON resource_categories FOR SELECT TO authenticated
  USING (
    (organization_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = resource_categories.organization_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR
    (organization_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
      AND user_state_associations.state_association_id = resource_categories.organization_id
      AND user_state_associations.role IN ('admin', 'state_admin')
    ))
    OR
    (organization_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
      AND user_national_associations.national_association_id = resource_categories.organization_id
      AND user_national_associations.role IN ('admin', 'national_admin')
    ))
  );

CREATE POLICY "Organization admins can create categories"
  ON resource_categories FOR INSERT TO authenticated
  WITH CHECK (
    (organization_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = resource_categories.organization_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR
    (organization_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
      AND user_state_associations.state_association_id = resource_categories.organization_id
      AND user_state_associations.role IN ('admin', 'state_admin')
    ))
    OR
    (organization_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
      AND user_national_associations.national_association_id = resource_categories.organization_id
      AND user_national_associations.role IN ('admin', 'national_admin')
    ))
  );

CREATE POLICY "Organization admins can update their categories"
  ON resource_categories FOR UPDATE TO authenticated
  USING (
    (organization_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = resource_categories.organization_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR
    (organization_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
      AND user_state_associations.state_association_id = resource_categories.organization_id
      AND user_state_associations.role IN ('admin', 'state_admin')
    ))
    OR
    (organization_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
      AND user_national_associations.national_association_id = resource_categories.organization_id
      AND user_national_associations.role IN ('admin', 'national_admin')
    ))
  );

CREATE POLICY "Organization admins can delete their categories"
  ON resource_categories FOR DELETE TO authenticated
  USING (
    (organization_type = 'club' AND EXISTS (
      SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = resource_categories.organization_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR
    (organization_type = 'state' AND EXISTS (
      SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
      AND user_state_associations.state_association_id = resource_categories.organization_id
      AND user_state_associations.role IN ('admin', 'state_admin')
    ))
    OR
    (organization_type = 'national' AND EXISTS (
      SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
      AND user_national_associations.national_association_id = resource_categories.organization_id
      AND user_national_associations.role IN ('admin', 'national_admin')
    ))
  );

CREATE POLICY "Anyone can view public resources"
  ON resources FOR SELECT
  USING (is_public = true);

CREATE POLICY "Organization admins can view all their resources"
  ON resources FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM resource_categories rc
      WHERE rc.id = resources.category_id
      AND (
        (rc.organization_type = 'club' AND EXISTS (
          SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = rc.organization_id AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR
        (rc.organization_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = rc.organization_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (rc.organization_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = rc.organization_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Organization admins can create resources"
  ON resources FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM resource_categories rc
      WHERE rc.id = resources.category_id
      AND (
        (rc.organization_type = 'club' AND EXISTS (
          SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = rc.organization_id AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR
        (rc.organization_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = rc.organization_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (rc.organization_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = rc.organization_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Organization admins can update their resources"
  ON resources FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM resource_categories rc
      WHERE rc.id = resources.category_id
      AND (
        (rc.organization_type = 'club' AND EXISTS (
          SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = rc.organization_id AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR
        (rc.organization_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = rc.organization_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (rc.organization_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = rc.organization_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Organization admins can delete their resources"
  ON resources FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM resource_categories rc
      WHERE rc.id = resources.category_id
      AND (
        (rc.organization_type = 'club' AND EXISTS (
          SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = rc.organization_id AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR
        (rc.organization_type = 'state' AND EXISTS (
          SELECT 1 FROM user_state_associations WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.state_association_id = rc.organization_id
          AND user_state_associations.role IN ('admin', 'state_admin')
        ))
        OR
        (rc.organization_type = 'national' AND EXISTS (
          SELECT 1 FROM user_national_associations WHERE user_national_associations.user_id = auth.uid()
          AND user_national_associations.national_association_id = rc.organization_id
          AND user_national_associations.role IN ('admin', 'national_admin')
        ))
      )
    )
  );

CREATE POLICY "Club members can view public club resources"
  ON resources FOR SELECT TO authenticated
  USING (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM resource_categories rc
      WHERE rc.id = resources.category_id
      AND rc.organization_type = 'club'
      AND EXISTS (
        SELECT 1 FROM user_clubs WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.club_id = rc.organization_id
      )
    )
  );