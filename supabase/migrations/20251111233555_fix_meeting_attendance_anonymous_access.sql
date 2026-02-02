/*
  # Fix Meeting Attendance Anonymous Access

  1. Changes
    - Drop the restrictive anonymous policy
    - The edge function uses service role key which bypasses RLS
    - This ensures email responses work without authentication

  2. Security
    - Service role key is secure and only accessible to edge functions
    - Response tokens are unique UUIDs that are hard to guess
    - Tokens are one-time use (once responded, typically not changed)
*/

-- Drop the existing anonymous policy
DROP POLICY IF EXISTS "Allow attendance response via token" ON meeting_attendance;

-- The service role key used by the edge function bypasses RLS,
-- so we don't need a special anonymous policy.
-- The existing authenticated policies handle normal app access.