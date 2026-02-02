/*
  # Boat Classes System

  1. New Tables
    - `boat_classes`
      - `id` (uuid, primary key)
      - `name` (text, class name)
      - `description` (text, class description)
      - `class_image` (text, main image URL for tiles)
      - `gallery_images` (jsonb, array of image URLs)
      - `created_by_type` (text, 'national' or 'state')
      - `created_by_association_id` (uuid, references national_associations or state_associations)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `club_boat_classes`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `boat_class_id` (uuid, references boat_classes)
      - `created_at` (timestamptz)
      - Unique constraint on (club_id, boat_class_id)

  2. Storage
    - Create storage bucket for boat class images

  3. Security
    - Enable RLS on all tables
    - National/State admins can manage boat classes
    - Club admins can select their club's classes
    - All authenticated users can view active classes
*/

-- Create boat_classes table
CREATE TABLE IF NOT EXISTS boat_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  class_image text,
  gallery_images jsonb DEFAULT '[]'::jsonb,
  created_by_type text NOT NULL CHECK (created_by_type IN ('national', 'state')),
  created_by_association_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create club_boat_classes junction table
CREATE TABLE IF NOT EXISTS club_boat_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  boat_class_id uuid NOT NULL REFERENCES boat_classes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(club_id, boat_class_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_boat_classes_created_by ON boat_classes(created_by_type, created_by_association_id);
CREATE INDEX IF NOT EXISTS idx_boat_classes_active ON boat_classes(is_active);
CREATE INDEX IF NOT EXISTS idx_club_boat_classes_club_id ON club_boat_classes(club_id);
CREATE INDEX IF NOT EXISTS idx_club_boat_classes_boat_class_id ON club_boat_classes(boat_class_id);

-- Create storage bucket for boat class images
INSERT INTO storage.buckets (id, name, public)
VALUES ('boat-classes', 'boat-classes', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE boat_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_boat_classes ENABLE ROW LEVEL SECURITY;

-- boat_classes RLS policies

-- Anyone authenticated can view active boat classes
CREATE POLICY "Authenticated users can view active boat classes"
  ON boat_classes FOR SELECT
  TO authenticated
  USING (is_active = true);

-- National admins can create national-level boat classes
CREATE POLICY "National admins can create national boat classes"
  ON boat_classes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'national' AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = created_by_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  );

-- State admins can create state-level boat classes
CREATE POLICY "State admins can create state boat classes"
  ON boat_classes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'state' AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = created_by_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
  );

-- National/State admins can update their own boat classes
CREATE POLICY "Association admins can update their boat classes"
  ON boat_classes FOR UPDATE
  TO authenticated
  USING (
    (created_by_type = 'national' AND
     EXISTS (
       SELECT 1 FROM user_national_associations una
       WHERE una.national_association_id = created_by_association_id
       AND una.user_id = auth.uid()
       AND una.role = 'admin'
     ))
    OR
    (created_by_type = 'state' AND
     EXISTS (
       SELECT 1 FROM user_state_associations usa
       WHERE usa.state_association_id = created_by_association_id
       AND usa.user_id = auth.uid()
       AND usa.role = 'admin'
     ))
  )
  WITH CHECK (
    (created_by_type = 'national' AND
     EXISTS (
       SELECT 1 FROM user_national_associations una
       WHERE una.national_association_id = created_by_association_id
       AND una.user_id = auth.uid()
       AND una.role = 'admin'
     ))
    OR
    (created_by_type = 'state' AND
     EXISTS (
       SELECT 1 FROM user_state_associations usa
       WHERE usa.state_association_id = created_by_association_id
       AND usa.user_id = auth.uid()
       AND usa.role = 'admin'
     ))
  );

-- National/State admins can delete their own boat classes
CREATE POLICY "Association admins can delete their boat classes"
  ON boat_classes FOR DELETE
  TO authenticated
  USING (
    (created_by_type = 'national' AND
     EXISTS (
       SELECT 1 FROM user_national_associations una
       WHERE una.national_association_id = created_by_association_id
       AND una.user_id = auth.uid()
       AND una.role = 'admin'
     ))
    OR
    (created_by_type = 'state' AND
     EXISTS (
       SELECT 1 FROM user_state_associations usa
       WHERE usa.state_association_id = created_by_association_id
       AND usa.user_id = auth.uid()
       AND usa.role = 'admin'
     ))
  );

-- club_boat_classes RLS policies

-- Users can view their club's boat classes
CREATE POLICY "Users can view their club's boat classes"
  ON club_boat_classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_boat_classes.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Club admins can add boat classes to their club
CREATE POLICY "Club admins can add boat classes"
  ON club_boat_classes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_boat_classes.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Club admins can remove boat classes from their club
CREATE POLICY "Club admins can remove boat classes"
  ON club_boat_classes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_boat_classes.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Storage policies for boat-classes bucket

-- Anyone can view boat class images (public bucket)
CREATE POLICY "Anyone can view boat class images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'boat-classes');

-- Association admins can upload images
CREATE POLICY "Association admins can upload boat class images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'boat-classes' AND
    (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role = 'admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role = 'admin'
      )
    )
  );

-- Association admins can update their images
CREATE POLICY "Association admins can update boat class images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'boat-classes' AND
    (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role = 'admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role = 'admin'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'boat-classes'
  );

-- Association admins can delete their images
CREATE POLICY "Association admins can delete boat class images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'boat-classes' AND
    (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role = 'admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role = 'admin'
      )
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_boat_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_boat_classes_updated_at_trigger ON boat_classes;
CREATE TRIGGER update_boat_classes_updated_at_trigger
  BEFORE UPDATE ON boat_classes
  FOR EACH ROW
  EXECUTE FUNCTION update_boat_classes_updated_at();
