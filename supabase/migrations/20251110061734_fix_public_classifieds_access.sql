/*
  # Fix Public Access to Classifieds

  1. Changes
    - Add policy for anonymous/public users to view active classifieds
    - Allows public website visitors to browse classifieds listings
  
  2. Security
    - Only allows viewing active classifieds
    - No modification permissions for anonymous users
*/

CREATE POLICY "Public can view active classifieds"
  ON classifieds
  FOR SELECT
  TO anon
  USING (status = 'active');
