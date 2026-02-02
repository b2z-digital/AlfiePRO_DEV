/*
  # Create storage buckets for media uploads
  
  1. Changes
    - Create event-media bucket for storing event-related media files
    - Create public bucket for general file storage
    - Set appropriate file size limits and MIME type restrictions
    
  2. Security
    - Enable public read access for media files
    - Restrict write operations to authenticated users
    - Allow users to manage their own uploaded files
*/

-- Create the event-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create the public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public',
  'public', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Create policies for event-media bucket
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public read access for event-media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Public read access for event-media"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'event-media');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Authenticated users can upload
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can upload to event-media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Authenticated users can upload to event-media"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'event-media');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Users can update their own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can update their own files in event-media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Users can update their own files in event-media"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'event-media' AND auth.uid()::text = owner)
      WITH CHECK (bucket_id = 'event-media');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Users can delete their own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can delete their own files in event-media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Users can delete their own files in event-media"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'event-media' AND auth.uid()::text = owner);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;
END $$;

-- Create policies for public bucket
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public read access for public bucket'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Public read access for public bucket"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'public');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Authenticated users can upload
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can upload to public bucket'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Authenticated users can upload to public bucket"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'public');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Users can update their own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can update their own files in public bucket'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Users can update their own files in public bucket"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'public' AND auth.uid()::text = owner)
      WITH CHECK (bucket_id = 'public');
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;

  -- Users can delete their own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can delete their own files in public bucket'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    BEGIN
      CREATE POLICY "Users can delete their own files in public bucket"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'public' AND auth.uid()::text = owner);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy creation due to insufficient privileges';
    END;
  END IF;
END $$;