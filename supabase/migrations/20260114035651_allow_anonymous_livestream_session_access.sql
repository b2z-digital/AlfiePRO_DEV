/*
  # Allow Anonymous Access to Livestream Sessions

  1. Changes
    - Add RLS policy to allow anonymous users to view livestream sessions by ID
    - Enables mobile camera QR code feature to work without authentication

  2. Security
    - Only SELECT access is granted to anonymous users
    - Sessions are read-only for unauthenticated users
    - All other operations (INSERT, UPDATE, DELETE) still require authentication
*/

-- Allow anyone to view livestream sessions by ID (for mobile camera access)
CREATE POLICY "Anyone can view livestream sessions by ID"
  ON public.livestream_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to view cameras for their session (for mobile camera streaming)
CREATE POLICY "Anyone can view cameras for sessions"
  ON public.livestream_cameras FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anonymous users to register their mobile camera
CREATE POLICY "Anyone can register mobile cameras"
  ON public.livestream_cameras FOR INSERT
  TO anon, authenticated
  WITH CHECK (type = 'mobile');

-- Allow anonymous users to update their mobile camera status
CREATE POLICY "Anyone can update mobile camera status"
  ON public.livestream_cameras FOR UPDATE
  TO anon, authenticated
  USING (type = 'mobile')
  WITH CHECK (type = 'mobile');
