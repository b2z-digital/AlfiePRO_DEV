/*
  # Set up storage bucket and policies for event media
  
  1. Changes
    - Create event-media storage bucket
    - Add media and livestream columns to race_series
    - Set up storage policies for public access and authenticated operations
    
  2. Notes
    - Uses safe policy creation with existence checks
    - Adds JSONB array for media items
    - Adds text field for livestream URL
*/

BEGIN;

-- Create storage bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-media', 'event-media', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Add media column to race_series if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'media'
  ) THEN
    ALTER TABLE race_series ADD COLUMN media JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add livestream_url column to race_series if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'livestream_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN livestream_url TEXT;
  END IF;
END $$;

-- Create storage policies
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Public Access'
  ) THEN
    CREATE POLICY "Public Access"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'event-media');
  END IF;

  -- Authenticated upload access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Authenticated Upload'
  ) THEN
    CREATE POLICY "Authenticated Upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'event-media');
  END IF;

  -- Authenticated delete access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Owner Delete'
  ) THEN
    CREATE POLICY "Owner Delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

COMMIT;