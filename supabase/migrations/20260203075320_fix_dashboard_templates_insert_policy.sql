/*
  # Fix Dashboard Templates Insert Policy
  
  1. Changes
    - Update RLS policy to allow both 'admin' and 'super_admin' roles to create templates
    - This fixes the issue where super admins cannot save new templates for their clubs
  
  2. Security
    - Maintains proper RLS by checking user membership and admin status
    - Only allows inserting templates for clubs where user is admin or super_admin
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Club admins can manage club templates" ON dashboard_templates;

-- Recreate with support for both admin and super_admin roles
CREATE POLICY "Club admins can manage club templates"
  ON dashboard_templates
  FOR ALL
  TO authenticated
  USING (
    club_id IS NOT NULL 
    AND auth.uid() IN (
      SELECT user_id 
      FROM user_clubs 
      WHERE club_id = dashboard_templates.club_id 
        AND role IN ('admin'::club_role, 'super_admin'::club_role)
    )
  )
  WITH CHECK (
    club_id IS NOT NULL 
    AND auth.uid() IN (
      SELECT user_id 
      FROM user_clubs 
      WHERE club_id = dashboard_templates.club_id 
        AND role IN ('admin'::club_role, 'super_admin'::club_role)
    )
  );
