/*
  # Allow Public Read Access to Venues

  1. Changes
    - Add RLS policy to allow anonymous users to read venue information
    - This is needed for the live tracking page to display venue images
  
  2. Security
    - Only SELECT access is granted to public
    - INSERT, UPDATE, DELETE remain restricted to authenticated users
*/

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Public can view venues" ON venues;

-- Create new policy allowing public read access
CREATE POLICY "Public can view venues"
  ON venues
  FOR SELECT
  TO anon, authenticated
  USING (true);
