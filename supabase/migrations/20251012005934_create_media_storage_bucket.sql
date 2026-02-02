/*
  # Create Media Storage Bucket

  1. Storage Setup
    - Create 'media' bucket for image uploads
    - Set bucket to public for easy access
    - Configure file size limit (50MB)
    - Allow image file types

  2. Security
    - Enable RLS on storage.objects
    - Allow authenticated users to upload images
    - Allow everyone to read media (public bucket)
    - Allow authenticated users to delete their uploaded media
*/

-- Create media bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for storage.objects

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

-- Allow anyone to read media (since bucket is public)
CREATE POLICY "Anyone can view media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'media');

-- Allow authenticated users to delete media
CREATE POLICY "Authenticated users can delete media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'media');

-- Allow authenticated users to update media
CREATE POLICY "Authenticated users can update media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media')
WITH CHECK (bucket_id = 'media');
