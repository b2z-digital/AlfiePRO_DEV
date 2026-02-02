/*
  # Allow Applicants to View Club Admins

  ## Changes
  - Add RLS policy to allow users with pending membership applications to view admin users of the club they're applying to
  - This enables the "Contact Club" feature on the application pending screen

  ## Security
  - Only allows viewing user_clubs records where:
    - The user has a non-draft membership application for that club
    - The role being viewed is 'admin'
  - Does not expose sensitive information, only allows seeing who the admins are
*/

-- Drop policy if it exists
DROP POLICY IF EXISTS "Applicants can view club admins" ON user_clubs;

-- Add policy to allow applicants to view club admins
CREATE POLICY "Applicants can view club admins"
  ON user_clubs
  FOR SELECT
  TO authenticated
  USING (
    role = 'admin' AND EXISTS (
      SELECT 1 FROM membership_applications
      WHERE membership_applications.user_id = auth.uid()
        AND membership_applications.club_id = user_clubs.club_id
        AND membership_applications.is_draft = false
    )
  );
