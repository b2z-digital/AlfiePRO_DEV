/*
  # Add Association Support to Homepage Tables

  1. Changes
    - Make club_id nullable in homepage_slides and homepage_tiles
    - Add state_association_id and national_association_id columns
    - Update RLS policies to support associations
    - Add check constraints to ensure one and only one entity reference
    - Create indexes for association lookups

  2. Security
    - Update RLS to allow state/national admins to manage their association's homepage content
    - Public can view active slides and tiles for any entity
*/

-- Add association columns to homepage_slides
ALTER TABLE homepage_slides
  DROP CONSTRAINT IF EXISTS homepage_slides_club_id_fkey,
  ALTER COLUMN club_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE;

-- Add association columns to homepage_tiles
ALTER TABLE homepage_tiles
  DROP CONSTRAINT IF EXISTS homepage_tiles_club_id_fkey,
  ALTER COLUMN club_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS state_association_id uuid REFERENCES state_associations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS national_association_id uuid REFERENCES national_associations(id) ON DELETE CASCADE;

-- Re-add foreign key for club_id (now nullable)
ALTER TABLE homepage_slides
  ADD CONSTRAINT homepage_slides_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE homepage_tiles
  ADD CONSTRAINT homepage_tiles_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

-- Add check constraints to ensure exactly one entity reference
ALTER TABLE homepage_slides
  DROP CONSTRAINT IF EXISTS homepage_slides_entity_check,
  ADD CONSTRAINT homepage_slides_entity_check CHECK (
    (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL)
  );

ALTER TABLE homepage_tiles
  DROP CONSTRAINT IF EXISTS homepage_tiles_entity_check,
  ADD CONSTRAINT homepage_tiles_entity_check CHECK (
    (club_id IS NOT NULL AND state_association_id IS NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NOT NULL AND national_association_id IS NULL) OR
    (club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NOT NULL)
  );

-- Create indexes for association lookups
CREATE INDEX IF NOT EXISTS idx_homepage_slides_state_association ON homepage_slides(state_association_id);
CREATE INDEX IF NOT EXISTS idx_homepage_slides_national_association ON homepage_slides(national_association_id);
CREATE INDEX IF NOT EXISTS idx_homepage_tiles_state_association ON homepage_tiles(state_association_id);
CREATE INDEX IF NOT EXISTS idx_homepage_tiles_national_association ON homepage_tiles(national_association_id);

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Club admins can insert slides" ON homepage_slides;
DROP POLICY IF EXISTS "Club admins can update slides" ON homepage_slides;
DROP POLICY IF EXISTS "Club admins can delete slides" ON homepage_slides;
DROP POLICY IF EXISTS "Club admins can insert tiles" ON homepage_tiles;
DROP POLICY IF EXISTS "Club admins can update tiles" ON homepage_tiles;
DROP POLICY IF EXISTS "Club admins can delete tiles" ON homepage_tiles;

-- Create updated RLS policies for homepage_slides

-- Insert policy
CREATE POLICY "Entity admins can insert slides"
  ON homepage_slides FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_slides.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_slides.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );

-- Update policy
CREATE POLICY "Entity admins can update slides"
  ON homepage_slides FOR UPDATE
  TO authenticated
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_slides.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_slides.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  )
  WITH CHECK (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_slides.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_slides.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );

-- Delete policy
CREATE POLICY "Entity admins can delete slides"
  ON homepage_slides FOR DELETE
  TO authenticated
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_slides.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_slides.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_slides.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );

-- Create updated RLS policies for homepage_tiles

-- Insert policy
CREATE POLICY "Entity admins can insert tiles"
  ON homepage_tiles FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_tiles.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_tiles.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );

-- Update policy
CREATE POLICY "Entity admins can update tiles"
  ON homepage_tiles FOR UPDATE
  TO authenticated
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_tiles.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_tiles.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  )
  WITH CHECK (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_tiles.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_tiles.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );

-- Delete policy
CREATE POLICY "Entity admins can delete tiles"
  ON homepage_tiles FOR DELETE
  TO authenticated
  USING (
    -- Club admins
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = homepage_tiles.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    ))
    OR
    -- State association admins
    (state_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE user_state_associations.state_association_id = homepage_tiles.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'state_admin'
    ))
    OR
    -- National association admins
    (national_association_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE user_national_associations.national_association_id = homepage_tiles.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    ))
  );
