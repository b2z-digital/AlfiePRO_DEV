/*
  # Fix Event Websites RLS Policies
  
  1. Problem
    - Existing policies call user_can_access_event_website() causing recursion
    - This leads to stack depth exceeded errors
  
  2. Solution
    - Replace with simpler policies that check user_clubs directly
    - No function calls that could trigger recursive RLS checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can delete event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can update event websites" ON event_websites;
DROP POLICY IF EXISTS "Admins can view event websites" ON event_websites;
DROP POLICY IF EXISTS "Public can view published event websites" ON event_websites;

-- Create simple, non-recursive policies
-- SELECT: Admins can see all, public can see published
CREATE POLICY "Admins and members can view websites"
  ON event_websites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin', 'member')
    )
  );

-- Public can view published websites
CREATE POLICY "Public can view published websites"
  ON event_websites
  FOR SELECT
  TO public
  USING (status = 'published' AND enabled = true);

-- INSERT: Only admins
CREATE POLICY "Admins can create websites"
  ON event_websites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- UPDATE: Only admins
CREATE POLICY "Admins can update websites"
  ON event_websites
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );

-- DELETE: Only admins
CREATE POLICY "Admins can delete websites"
  ON event_websites
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin')
    )
  );