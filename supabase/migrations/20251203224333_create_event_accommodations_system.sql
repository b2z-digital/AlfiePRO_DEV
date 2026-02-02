/*
  # Create Event Accommodations System

  1. New Tables
    - `event_accommodations`
      - `id` (uuid, primary key)
      - `event_website_id` (uuid, foreign key to event_websites)
      - `name` (text) - Accommodation name
      - `type` (text) - Hotel, Motel, BnB, Holiday Rental, Camping, etc.
      - `address` (text) - Full address
      - `latitude` (numeric) - Location coordinate
      - `longitude` (numeric) - Location coordinate
      - `description` (text) - Details about the accommodation
      - `website_url` (text) - Accommodation website
      - `booking_url` (text) - Direct booking link
      - `phone` (text) - Contact phone
      - `email` (text) - Contact email
      - `price_range` (text) - e.g., "$100-$150", "$$", etc.
      - `star_rating` (numeric) - 1-5 stars
      - `amenities` (jsonb) - Array of amenities (wifi, parking, pool, etc.)
      - `image_url` (text) - Accommodation image
      - `distance_from_venue` (numeric) - Distance in km (optional)
      - `display_order` (integer) - Manual ordering
      - `is_featured` (boolean) - Feature on map
      - `is_published` (boolean) - Show on map
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `event_accommodations` table
    - Add policies for event organizers to manage accommodations
    - Add policies for public to view published accommodations
*/

-- Create event_accommodations table
CREATE TABLE IF NOT EXISTS event_accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid NOT NULL REFERENCES event_websites(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'hotel',
  address text,
  latitude numeric,
  longitude numeric,
  description text,
  website_url text,
  booking_url text,
  phone text,
  email text,
  price_range text,
  star_rating numeric CHECK (star_rating >= 0 AND star_rating <= 5),
  amenities jsonb DEFAULT '[]'::jsonb,
  image_url text,
  distance_from_venue numeric,
  display_order integer DEFAULT 0,
  is_featured boolean DEFAULT false,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE event_accommodations ENABLE ROW LEVEL SECURITY;

-- Policy: Event organizers can view all accommodations for their events
CREATE POLICY "Event organizers can view accommodations"
  ON event_accommodations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_accommodations.event_website_id
      AND (
        -- Club admin/editor of the event's club
        EXISTS (
          SELECT 1 FROM public_events pe
          JOIN user_clubs uc ON uc.club_id = pe.club_id
          WHERE pe.id = ew.event_id
          AND uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        )
        OR
        -- State/National admin
        auth.uid() IN (
          SELECT user_id FROM user_clubs WHERE role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Policy: Event organizers can insert accommodations
CREATE POLICY "Event organizers can insert accommodations"
  ON event_accommodations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_accommodations.event_website_id
      AND (
        EXISTS (
          SELECT 1 FROM public_events pe
          JOIN user_clubs uc ON uc.club_id = pe.club_id
          WHERE pe.id = ew.event_id
          AND uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        )
        OR
        auth.uid() IN (
          SELECT user_id FROM user_clubs WHERE role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Policy: Event organizers can update accommodations
CREATE POLICY "Event organizers can update accommodations"
  ON event_accommodations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_accommodations.event_website_id
      AND (
        EXISTS (
          SELECT 1 FROM public_events pe
          JOIN user_clubs uc ON uc.club_id = pe.club_id
          WHERE pe.id = ew.event_id
          AND uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        )
        OR
        auth.uid() IN (
          SELECT user_id FROM user_clubs WHERE role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Policy: Event organizers can delete accommodations
CREATE POLICY "Event organizers can delete accommodations"
  ON event_accommodations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_accommodations.event_website_id
      AND (
        EXISTS (
          SELECT 1 FROM public_events pe
          JOIN user_clubs uc ON uc.club_id = pe.club_id
          WHERE pe.id = ew.event_id
          AND uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        )
        OR
        auth.uid() IN (
          SELECT user_id FROM user_clubs WHERE role IN ('state_admin', 'national_admin')
        )
      )
    )
  );

-- Policy: Public can view published accommodations
CREATE POLICY "Public can view published accommodations"
  ON event_accommodations
  FOR SELECT
  TO anon
  USING (is_published = true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_event_accommodations_website 
  ON event_accommodations(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_accommodations_published 
  ON event_accommodations(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_event_accommodations_featured 
  ON event_accommodations(is_featured) WHERE is_featured = true;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_event_accommodations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_event_accommodations_updated_at
  BEFORE UPDATE ON event_accommodations
  FOR EACH ROW
  EXECUTE FUNCTION update_event_accommodations_updated_at();
