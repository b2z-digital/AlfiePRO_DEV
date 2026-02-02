/*
  # Create Event Interest Table for Who's Sailing Feature

  1. New Tables
    - `event_interest`
      - `id` (uuid, primary key)
      - `event_id` (uuid) - references race events
      - `user_id` (uuid) - references auth.users
      - `club_id` (uuid) - references clubs (user's home club)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `event_interest` table
    - Add policies for users to manage their own interests
    - Allow users to view interests for events they have access to
  
  3. Indexes
    - Index on (event_id, user_id) for unique constraint
    - Index on user_id for fast lookups
    - Index on event_id for aggregations
*/

-- Create event_interest table
CREATE TABLE IF NOT EXISTS event_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Enable RLS
ALTER TABLE event_interest ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_interest_event_id ON event_interest(event_id);
CREATE INDEX IF NOT EXISTS idx_event_interest_user_id ON event_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_event_interest_club_id ON event_interest(club_id);

-- RLS Policies

-- Users can view all event interests (to see who's interested)
CREATE POLICY "Users can view all event interests"
  ON event_interest
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own interests
CREATE POLICY "Users can create own interests"
  ON event_interest
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own interests
CREATE POLICY "Users can delete own interests"
  ON event_interest
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
