/*
  # Fix Event Registrations RLS - Use ANON Role Explicitly

  1. Changes
    - Drop existing INSERT policy
    - Create separate policies for anon and authenticated roles
    - Ensure both roles can insert without restrictions
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Public can create event registrations" ON event_registrations;

-- Create policy for anonymous users (guests)
CREATE POLICY "Anonymous users can create registrations"
  ON event_registrations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Create policy for authenticated users  
CREATE POLICY "Authenticated users can create registrations"
  ON event_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);