/*
  # Create Event Media Storage Bucket

  This migration creates the event-media storage bucket and sets up the necessary policies
  for public access and authenticated user operations.
*/

-- Create the event-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];

-- Policy to allow public access for viewing files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Public can view event media files'
  ) THEN
    CREATE POLICY "Public can view event media files"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'event-media');
  END IF;
END
$$;

-- Policy to allow authenticated users to upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Authenticated users can upload event media'
  ) THEN
    CREATE POLICY "Authenticated users can upload event media"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'event-media');
  END IF;
END
$$;

-- Policy to allow users to update their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can update their own event media'
  ) THEN
    CREATE POLICY "Users can update their own event media"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;
END
$$;

-- Policy to allow users to delete their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can delete their own event media'
  ) THEN
    CREATE POLICY "Users can delete their own event media"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;
END
$$;