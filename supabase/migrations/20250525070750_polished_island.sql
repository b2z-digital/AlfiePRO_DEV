/*
  # Add media storage and columns
  
  1. Changes
    - Create storage bucket for event media
    - Add media and livestream columns to race_series
    - Set up storage policies with proper checks
    
  2. Notes
    - Uses safe policy creation with existence checks
    - Adds JSONB array for media items
    - Adds text field for livestream URL
*/

-- Create storage bucket for event media if it doesn't exist
INSERT INTO storage.buckets (id, name)
SELECT 'event-media', 'event-media'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'event-media'
);

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

-- Update storage policies with existence checks
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Enable read access for all users" ON storage.objects;
  DROP POLICY IF EXISTS "Enable insert for authenticated users" ON storage.objects;
  DROP POLICY IF EXISTS "Enable update for authenticated users" ON storage.objects;
  DROP POLICY IF EXISTS "Enable delete for authenticated users" ON storage.objects;
  
  -- Create new policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Enable read access for all users'
  ) THEN
    CREATE POLICY "Enable read access for all users"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'event-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Enable insert for authenticated users'
  ) THEN
    CREATE POLICY "Enable insert for authenticated users"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'event-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Enable update for authenticated users'
  ) THEN
    CREATE POLICY "Enable update for authenticated users"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Enable delete for authenticated users'
  ) THEN
    CREATE POLICY "Enable delete for authenticated users"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;
END $$;