/*
  # Allow Public Access to Yacht Classes

  1. Changes
    - Add public SELECT policy for `boat_classes` table
    - Add public SELECT policy for `club_boat_classes` table
    - This allows anonymous users to view yacht classes on public club websites

  2. Security
    - Only allows SELECT operations for anonymous users
    - Only active boat classes are visible to public
    - Insert/Update/Delete still require authentication and proper permissions
*/

-- Allow anonymous users to view active boat classes
CREATE POLICY "Anonymous users can view active boat classes"
  ON boat_classes FOR SELECT
  TO anon
  USING (is_active = true);

-- Allow anonymous users to view club boat class relationships
CREATE POLICY "Anonymous users can view club boat classes"
  ON club_boat_classes FOR SELECT
  TO anon
  USING (true);
