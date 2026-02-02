/*
  # Add media support to race series and events
  
  1. Changes
    - Add storage bucket for event media
    - Add media column to race_series table
    - Add livestream_url column to race_series table
    
  2. Notes
    - Uses JSONB for media array to store structured data
    - Includes support for both images and livestream URLs
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

-- Update storage policies
CREATE POLICY "Enable read access for all users"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-media');

CREATE POLICY "Enable insert for authenticated users"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-media');

CREATE POLICY "Enable update for authenticated users"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-media');

CREATE POLICY "Enable delete for authenticated users"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-media');