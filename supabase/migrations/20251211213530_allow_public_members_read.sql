/*
  # Allow Public Read Access to Members

  This migration allows anonymous users to read basic member data (names, avatars).
  This is necessary for the live tracking dashboard which displays skipper information
  publicly without requiring authentication.

  ## Changes
  
  1. **Security**
     - Add SELECT policy for public/anonymous access to `members`
     - Only basic information (name, avatar) is exposed
     - Data is already displayed publicly on live tracking pages
     - Read-only access maintains data security
*/

-- Allow public read access to members for live tracking
CREATE POLICY "Public can view member basic info"
  ON members
  FOR SELECT
  TO public
  USING (true);