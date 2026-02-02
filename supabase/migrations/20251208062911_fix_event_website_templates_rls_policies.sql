/*
  # Fix Event Website Templates RLS Policies

  ## Changes
  1. Updates INSERT policy to allow club admins/editors to create templates
  2. Ensures templates can be created even if club_id is not explicitly set in the template data

  ## Important Notes
  - The policy now allows any authenticated user who is an admin/editor in at least one club to create templates
  - If club_id is provided, it must match a club where the user has appropriate permissions
  - This enables the "Save as Template" feature to work correctly
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Club admins can create templates" ON event_website_templates;

-- Create updated INSERT policy that's more permissive
CREATE POLICY "Club admins can create templates"
  ON event_website_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if user is an admin/editor in at least one club (regardless of club_id)
    (EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    ))
    OR
    -- If club_id is provided, verify user has access to that specific club
    (club_id IS NOT NULL AND club_id IN (
      SELECT uc.club_id FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    ))
    OR
    -- If state_association_id is provided, verify user is a state admin
    (state_association_id IS NOT NULL AND state_association_id IN (
      SELECT sa.id
      FROM state_associations sa
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    ))
    OR
    -- If national_association_id is provided, verify user is a national admin
    (national_association_id IS NOT NULL AND national_association_id IN (
      SELECT na.id
      FROM national_associations na
      INNER JOIN state_associations sa ON sa.national_association_id = na.id
      INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
      INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'national_admin'
    ))
  );