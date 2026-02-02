-- Create the event-media bucket if it doesn't exist
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
    AND schemaname = 'storage'
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
    AND schemaname = 'storage'
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

-- Policy to allow users to update files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Users can update event media'
  ) THEN
    CREATE POLICY "Users can update event media"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;
END
$$;

-- Policy to allow users to delete files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Users can delete event media'
  ) THEN
    CREATE POLICY "Users can delete event media"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-media');
  END IF;
END
$$;