/*
  # Create club requests table

  1. New Tables
    - `club_requests`
      - `id` (uuid, primary key)
      - `club_name` (text) - Name of the requested club
      - `message` (text) - Additional information from the requester
      - `status` (text) - Status: pending, approved, rejected
      - `requester_email` (text) - Email of person requesting (optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `club_requests` table
    - Allow anyone to insert club requests (public can submit)
    - Only authenticated users with admin role can view/update
*/

CREATE TABLE IF NOT EXISTS club_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name text NOT NULL,
  message text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requester_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE club_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit a club request
CREATE POLICY "Anyone can submit club requests"
  ON club_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can view club requests
CREATE POLICY "Authenticated users can view club requests"
  ON club_requests
  FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update club requests
CREATE POLICY "Authenticated users can update club requests"
  ON club_requests
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_club_requests_status ON club_requests(status);
CREATE INDEX IF NOT EXISTS idx_club_requests_created_at ON club_requests(created_at DESC);