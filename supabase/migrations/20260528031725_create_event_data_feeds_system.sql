/*
  # Create Event Data Feeds System

  1. New Tables
    - `event_data_feeds`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `event_id` (uuid, references the quick_races event)
      - `organization_id` (uuid, references external_organizations, nullable)
      - `feed_token` (text, unique, 52-char random token for public URL)
      - `feed_name` (text, display name for this feed)
      - `format` (text, default 'json' - json/csv/html)
      - `is_active` (boolean, default true - can disable without deleting)
      - `include_race_details` (boolean, default true - include per-race scores)
      - `last_accessed_at` (timestamptz, tracks last time feed was consumed)
      - `access_count` (integer, default 0 - how many times accessed)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `event_data_feeds` table
    - Authenticated users can manage their own feeds
    - Anonymous/public can read active feeds by token (for consumption)

  3. Functions
    - `increment_feed_access(p_feed_token text)` - tracks access metrics

  4. Indexes
    - Feed token lookup (primary access pattern)
    - User's feeds list
    - Event-based lookup
*/

-- Create event_data_feeds table
CREATE TABLE IF NOT EXISTS event_data_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  organization_id uuid REFERENCES external_organizations(id) ON DELETE SET NULL,
  feed_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  feed_name text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'json',
  is_active boolean NOT NULL DEFAULT true,
  include_race_details boolean NOT NULL DEFAULT true,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE event_data_feeds ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own feeds
CREATE POLICY "Users can manage own data feeds"
  ON event_data_feeds
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Anyone can view active feeds (for public consumption via token)
CREATE POLICY "Public can read active feeds by token"
  ON event_data_feeds
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Policy: Authenticated users can also read active feeds
CREATE POLICY "Authenticated can read active feeds"
  ON event_data_feeds
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_data_feeds_token ON event_data_feeds(feed_token);
CREATE INDEX IF NOT EXISTS idx_event_data_feeds_user_id ON event_data_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_event_data_feeds_event_id ON event_data_feeds(event_id);

-- Function to increment feed access count and update last_accessed_at
CREATE OR REPLACE FUNCTION increment_feed_access(p_feed_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_data_feeds
  SET access_count = access_count + 1,
      last_accessed_at = now()
  WHERE feed_token = p_feed_token
    AND is_active = true;
END;
$$;
