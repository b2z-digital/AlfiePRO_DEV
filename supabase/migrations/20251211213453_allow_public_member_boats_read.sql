/*
  # Allow Public Read Access to Member Boats

  This migration allows anonymous users to read member boat data (sail numbers, member info).
  This is necessary for the live tracking dashboard which displays skipper information
  publicly without requiring authentication.

  ## Changes
  
  1. **Security**
     - Add SELECT policy for public/anonymous access to `member_boats`
     - Data is already displayed publicly on live tracking pages
     - Read-only access maintains data security
*/

-- Allow public read access to member_boats for live tracking
CREATE POLICY "Public can view member boats"
  ON member_boats
  FOR SELECT
  TO public
  USING (true);