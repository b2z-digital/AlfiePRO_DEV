/*
  # Fix Event Registrations RLS - Single Unified Policy

  1. Changes
    - Drop all INSERT policies
    - Create ONE unified INSERT policy for both anonymous and authenticated users
    - Ensure the policy uses PUBLIC role to cover all cases
*/

-- Drop all existing INSERT policies
DROP POLICY IF EXISTS "Allow anonymous and authenticated registrations" ON event_registrations;
DROP POLICY IF EXISTS "Allow authenticated user registrations" ON event_registrations;

-- Create a single unified INSERT policy that works for everyone
CREATE POLICY "Public can create event registrations"
  ON event_registrations
  FOR INSERT
  WITH CHECK (true);