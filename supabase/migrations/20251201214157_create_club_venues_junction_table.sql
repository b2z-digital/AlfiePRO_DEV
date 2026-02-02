/*
  # Create Venue Sharing System

  1. New Tables
    - `club_venues` (junction table)
      - `club_id` (uuid, foreign key to clubs)
      - `venue_id` (uuid, foreign key to venues)
      - `is_primary` (boolean) - indicates which club is the primary owner
      - `created_at` (timestamptz)

  2. Changes
    - Migrate existing venue-club relationships to junction table
    - Keep venues.club_id for backward compatibility and primary ownership
    - Add indexes for performance

  3. Security
    - Enable RLS on `club_venues` table
    - Add policies for club members and association admins
*/

-- Create the junction table for many-to-many relationship between clubs and venues
CREATE TABLE IF NOT EXISTS club_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_id, venue_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_club_venues_club_id ON club_venues(club_id);
CREATE INDEX IF NOT EXISTS idx_club_venues_venue_id ON club_venues(venue_id);
CREATE INDEX IF NOT EXISTS idx_club_venues_primary ON club_venues(is_primary) WHERE is_primary = true;

-- Migrate existing venue-club relationships to the junction table
-- Each existing venue gets a primary relationship with its current club
INSERT INTO club_venues (club_id, venue_id, is_primary)
SELECT club_id, id, true
FROM venues
WHERE club_id IS NOT NULL
ON CONFLICT (club_id, venue_id) DO NOTHING;

-- Enable RLS
ALTER TABLE club_venues ENABLE ROW LEVEL SECURITY;

-- Policy: Club members can view venues associated with their club
CREATE POLICY "Club members can view their club venues"
  ON club_venues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_venues.club_id
      AND user_clubs.user_id = auth.uid()
    )
  );

-- Policy: Club admins can add venue associations to their club
CREATE POLICY "Club admins can add venue associations"
  ON club_venues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy: Club admins can remove venue associations from their club
CREATE POLICY "Club admins can remove venue associations"
  ON club_venues
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = club_venues.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy: State association admins can view all club venues in their association
CREATE POLICY "State admins can view association club venues"
  ON club_venues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON c.state_association_id = usa.state_association_id
      WHERE c.id = club_venues.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
  );

-- Policy: State association admins can manage venue associations for clubs in their association
CREATE POLICY "State admins can manage association club venues"
  ON club_venues
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON c.state_association_id = usa.state_association_id
      WHERE c.id = club_venues.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON c.state_association_id = usa.state_association_id
      WHERE c.id = club_venues.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
  );
