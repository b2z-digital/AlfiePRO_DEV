/*
  # Create Homepage Slides and Quick Link Tiles

  1. New Tables
    - `homepage_slides`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `title` (text)
      - `subtitle` (text)
      - `image_url` (text)
      - `button_text` (text, optional)
      - `button_url` (text, optional)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `homepage_tiles`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `title` (text)
      - `description` (text)
      - `image_url` (text)
      - `link_url` (text)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Public can read active slides and tiles for their club
    - Only club admins/editors can manage slides and tiles
*/

-- Create homepage_slides table
CREATE TABLE IF NOT EXISTS homepage_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  subtitle text DEFAULT '',
  image_url text NOT NULL,
  button_text text DEFAULT '',
  button_url text DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create homepage_tiles table
CREATE TABLE IF NOT EXISTS homepage_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  image_url text NOT NULL,
  link_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_homepage_slides_club_id ON homepage_slides(club_id);
CREATE INDEX IF NOT EXISTS idx_homepage_slides_display_order ON homepage_slides(display_order);
CREATE INDEX IF NOT EXISTS idx_homepage_tiles_club_id ON homepage_tiles(club_id);
CREATE INDEX IF NOT EXISTS idx_homepage_tiles_display_order ON homepage_tiles(display_order);

-- Enable RLS
ALTER TABLE homepage_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE homepage_tiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for homepage_slides
CREATE POLICY "Anyone can view active slides"
  ON homepage_slides FOR SELECT
  USING (is_active = true);

CREATE POLICY "Club admins can insert slides"
  ON homepage_slides FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update slides"
  ON homepage_slides FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete slides"
  ON homepage_slides FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for homepage_tiles
CREATE POLICY "Anyone can view active tiles"
  ON homepage_tiles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Club admins can insert tiles"
  ON homepage_tiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can update tiles"
  ON homepage_tiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Club admins can delete tiles"
  ON homepage_tiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );