/*
  # Fix Public Events Anonymous Access

  1. Purpose
    - Allow anonymous (non-authenticated) users to view approved public events
    - Required for public club websites to display events

  2. Changes
    - Drop and recreate the public SELECT policy to explicitly allow anon role
    - This ensures the public club homepage can load events without authentication

  3. Security
    - Only approved events are visible
    - No write access for anonymous users
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Public can view approved events" ON public.public_events;

-- Create new policy that explicitly allows anon role
CREATE POLICY "Public can view approved events"
  ON public.public_events FOR SELECT
  TO public, anon, authenticated
  USING (approval_status = 'approved');
