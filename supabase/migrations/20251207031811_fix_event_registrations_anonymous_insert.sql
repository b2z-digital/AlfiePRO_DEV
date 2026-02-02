/*
  # Fix Event Registrations Anonymous Insert Policy

  1. Changes
    - Drop existing INSERT policy
    - Recreate with explicit anonymous user support
    - Ensure guest registrations (user_id = null) are allowed
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Anyone can create registrations" ON event_registrations;

-- Create new INSERT policy that explicitly allows anonymous users
CREATE POLICY "Allow anonymous and authenticated registrations"
  ON event_registrations
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Also ensure authenticated users can insert their own registrations
CREATE POLICY "Allow authenticated user registrations"
  ON event_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );