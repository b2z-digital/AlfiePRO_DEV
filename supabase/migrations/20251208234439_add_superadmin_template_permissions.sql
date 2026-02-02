/*
  # Add SuperAdmin Permissions for Global Templates

  1. Changes
    - Drop existing delete policy for templates
    - Create new delete policy that restricts global template deletion to SuperAdmins only
    - Update policy to allow SuperAdmins to delete any template
  
  2. Security
    - Global templates (is_public = true AND club_id IS NULL) can only be deleted by SuperAdmin
    - Club/association templates can be deleted by their respective admins
*/

-- Drop existing delete policy
DROP POLICY IF EXISTS "Users can delete own or org templates" ON event_website_templates;

-- Create new delete policy with SuperAdmin check
CREATE POLICY "Users can delete templates with proper permissions"
ON event_website_templates
FOR DELETE
TO authenticated
USING (
  -- SuperAdmins can delete any template
  (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  )
  OR
  -- For non-global templates, allow deletion by creators or org admins
  (
    (is_public = false OR club_id IS NOT NULL)
    AND
    (
      created_by = auth.uid()
      OR
      club_id IN (
        SELECT uc.club_id
        FROM user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'super_admin')
      )
      OR
      state_association_id IN (
        SELECT sa.id
        FROM state_associations sa
        JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('state_admin', 'super_admin')
      )
      OR
      national_association_id IN (
        SELECT na.id
        FROM national_associations na
        JOIN state_associations sa ON sa.national_association_id = na.id
        JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('national_admin', 'super_admin')
      )
    )
  )
);

-- Update update policy to include SuperAdmin check
DROP POLICY IF EXISTS "Users can update own or org templates" ON event_website_templates;

CREATE POLICY "Users can update templates with proper permissions"
ON event_website_templates
FOR UPDATE
TO authenticated
USING (
  -- SuperAdmins can update any template
  (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  )
  OR
  -- For non-global templates, allow updates by creators or org admins
  (
    (is_public = false OR club_id IS NOT NULL)
    AND
    (
      created_by = auth.uid()
      OR
      club_id IN (
        SELECT uc.club_id
        FROM user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'super_admin')
      )
      OR
      state_association_id IN (
        SELECT sa.id
        FROM state_associations sa
        JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('state_admin', 'super_admin')
      )
      OR
      national_association_id IN (
        SELECT na.id
        FROM national_associations na
        JOIN state_associations sa ON sa.national_association_id = na.id
        JOIN state_association_clubs sac ON sac.state_association_id = sa.id
        JOIN user_clubs uc ON uc.club_id = sac.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('national_admin', 'super_admin')
      )
    )
  )
);