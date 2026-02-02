/*
  # Fix Marketing Email Templates Insert Policy

  1. Changes
    - Update INSERT policy to allow all club members (not just admins) to create templates
    - Marketing templates are creative content, not administrative functions
    - All club members should be able to create and design email templates

  2. Security
    - Still requires authenticated users
    - Still requires club membership
    - Only allows templates for clubs where user is a member
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Club admins can create templates" ON marketing_email_templates;

-- Create new policy that allows all club members
CREATE POLICY "Club members can create templates"
  ON marketing_email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = marketing_email_templates.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );
