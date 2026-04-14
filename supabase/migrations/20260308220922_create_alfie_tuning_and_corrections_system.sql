/*
  # Create Alfie Tuning Guides and Knowledge Corrections System

  1. New Tables
    - `alfie_tuning_guides`
      - `id` (uuid, primary key)
      - `name` (text) - Display name for the tuning guide
      - `boat_type` (text) - Boat class this guide applies to (e.g., "DragonFlite 95 (DF95)")
      - `hull_type` (text, nullable) - Specific hull variant if applicable
      - `description` (text, nullable) - Brief description of guide contents
      - `version` (text) - Version number of the guide
      - `storage_path` (text) - Path in alfie-knowledge storage bucket
      - `file_name` (text) - Original uploaded file name
      - `file_size` (integer) - File size in bytes
      - `status` (text) - Processing status: pending, processing, completed, failed
      - `processing_error` (text, nullable) - Error message if processing failed
      - `processed_at` (timestamptz, nullable) - When processing completed
      - `chunk_count` (integer) - Number of knowledge chunks created
      - `image_count` (integer) - Number of images extracted
      - `uploaded_by` (uuid) - User who uploaded the guide
      - `is_active` (boolean) - Whether this guide is active for Alfie
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `alfie_knowledge_corrections`
      - `id` (uuid, primary key)
      - `topic` (text) - Category/topic of the correction
      - `boat_type` (text, nullable) - Boat class if boat-specific
      - `scenario` (text) - Question or situation this applies to
      - `incorrect_response` (text, nullable) - What Alfie said wrong
      - `correct_information` (text) - What Alfie should know/say instead
      - `priority` (text) - high, medium, or low
      - `status` (text) - active or inactive
      - `times_surfaced` (integer) - How many times this correction was used in responses
      - `last_surfaced_at` (timestamptz, nullable) - When it was last surfaced
      - `created_by` (uuid) - User who created the correction
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Modified Tables
    - `alfie_knowledge_chunks` - Add boat_type, hull_type, source_type columns
    - `alfie_knowledge_images` - Add boat_type, hull_type columns

  3. Security
    - Enable RLS on both new tables
    - Super admins and national admins can manage tuning guides and corrections
    - Authenticated users can read active tuning guides
*/

-- Create alfie_tuning_guides table
CREATE TABLE IF NOT EXISTS alfie_tuning_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  boat_type text NOT NULL DEFAULT '',
  hull_type text DEFAULT '',
  description text DEFAULT '',
  version text NOT NULL DEFAULT '1.0',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  processing_error text,
  processed_at timestamptz,
  chunk_count integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alfie_tuning_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tuning guides"
  ON alfie_tuning_guides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'national_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'national_admin')
    )
  );

CREATE POLICY "Authenticated users can read active tuning guides"
  ON alfie_tuning_guides
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Create alfie_knowledge_corrections table
CREATE TABLE IF NOT EXISTS alfie_knowledge_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL DEFAULT 'general',
  boat_type text DEFAULT '',
  scenario text NOT NULL,
  incorrect_response text DEFAULT '',
  correct_information text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  times_surfaced integer NOT NULL DEFAULT 0,
  last_surfaced_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alfie_knowledge_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage corrections"
  ON alfie_knowledge_corrections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'national_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('super_admin', 'national_admin')
    )
  );

CREATE POLICY "Authenticated users can read active corrections"
  ON alfie_knowledge_corrections
  FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Add metadata columns to alfie_knowledge_chunks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_chunks' AND column_name = 'boat_type'
  ) THEN
    ALTER TABLE alfie_knowledge_chunks ADD COLUMN boat_type text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_chunks' AND column_name = 'hull_type'
  ) THEN
    ALTER TABLE alfie_knowledge_chunks ADD COLUMN hull_type text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_chunks' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE alfie_knowledge_chunks ADD COLUMN source_type text DEFAULT 'document';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_chunks' AND column_name = 'tuning_guide_id'
  ) THEN
    ALTER TABLE alfie_knowledge_chunks ADD COLUMN tuning_guide_id uuid REFERENCES alfie_tuning_guides(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_chunks' AND column_name = 'correction_id'
  ) THEN
    ALTER TABLE alfie_knowledge_chunks ADD COLUMN correction_id uuid REFERENCES alfie_knowledge_corrections(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add metadata columns to alfie_knowledge_images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_images' AND column_name = 'boat_type'
  ) THEN
    ALTER TABLE alfie_knowledge_images ADD COLUMN boat_type text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_images' AND column_name = 'hull_type'
  ) THEN
    ALTER TABLE alfie_knowledge_images ADD COLUMN hull_type text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_knowledge_images' AND column_name = 'tuning_guide_id'
  ) THEN
    ALTER TABLE alfie_knowledge_images ADD COLUMN tuning_guide_id uuid REFERENCES alfie_tuning_guides(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_alfie_tuning_guides_boat_type ON alfie_tuning_guides(boat_type);
CREATE INDEX IF NOT EXISTS idx_alfie_tuning_guides_status ON alfie_tuning_guides(status);
CREATE INDEX IF NOT EXISTS idx_alfie_tuning_guides_is_active ON alfie_tuning_guides(is_active);
CREATE INDEX IF NOT EXISTS idx_alfie_corrections_topic ON alfie_knowledge_corrections(topic);
CREATE INDEX IF NOT EXISTS idx_alfie_corrections_boat_type ON alfie_knowledge_corrections(boat_type);
CREATE INDEX IF NOT EXISTS idx_alfie_corrections_status ON alfie_knowledge_corrections(status);
CREATE INDEX IF NOT EXISTS idx_alfie_corrections_priority ON alfie_knowledge_corrections(priority);
CREATE INDEX IF NOT EXISTS idx_alfie_chunks_source_type ON alfie_knowledge_chunks(source_type);
CREATE INDEX IF NOT EXISTS idx_alfie_chunks_boat_type ON alfie_knowledge_chunks(boat_type);
CREATE INDEX IF NOT EXISTS idx_alfie_chunks_tuning_guide_id ON alfie_knowledge_chunks(tuning_guide_id);
CREATE INDEX IF NOT EXISTS idx_alfie_chunks_correction_id ON alfie_knowledge_chunks(correction_id);
CREATE INDEX IF NOT EXISTS idx_alfie_images_tuning_guide_id ON alfie_knowledge_images(tuning_guide_id);