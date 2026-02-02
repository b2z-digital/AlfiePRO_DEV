/*
  # Ensure Media Bucket Exists for Club Logos

  1. Storage Setup
    - Ensure 'media' bucket exists for club logo uploads
    - Set bucket to public for easy access
    - Configure file size limit (50MB)
    - Allow image file types

  2. Security
    - Drop and recreate conflicting policies
    - Allow authenticated users to upload images
    - Allow everyone to read media (public bucket)
    - Allow authenticated users to manage their uploads
*/

-- Ensure media bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];

-- Drop conflicting policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update media" ON storage.objects;

-- Create policies for media bucket with unique names
CREATE POLICY "media_bucket_authenticated_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

CREATE POLICY "media_bucket_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'media');

CREATE POLICY "media_bucket_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'media');

CREATE POLICY "media_bucket_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');
