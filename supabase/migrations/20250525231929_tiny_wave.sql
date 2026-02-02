BEGIN;

-- Create the storage bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  SELECT 'event-media', 'event-media', true
  WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'event-media'
  );
END $$;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public users can read media" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;
END $$;

-- Create new policies
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Public users can read media'
  ) THEN
    CREATE POLICY "Public users can read media"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'event-media');
  END IF;

  -- Authenticated upload access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Authenticated users can upload media'
  ) THEN
    CREATE POLICY "Authenticated users can upload media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'event-media');
  END IF;

  -- Authenticated delete access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Users can delete their own media'
  ) THEN
    CREATE POLICY "Users can delete their own media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-media' AND auth.uid() = owner::uuid);
  END IF;
END $$;

COMMIT;