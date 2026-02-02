/*
  # Create event-media storage bucket

  1. New Storage Bucket
    - `event-media` bucket for storing race and event media files
    - Public access enabled for reading files
    - Authenticated users can upload files

  2. Security Policies
    - Public can view/download files
    - Authenticated users can upload files
    - Users can delete their own uploaded files
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
CREATE POLICY "Public can view event media files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-media');

-- Policy to allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload event media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-media');

-- Policy to allow users to update their own files
CREATE POLICY "Users can update their own event media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy to allow users to delete their own files
CREATE POLICY "Users can delete their own event media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = (storage.foldername(name))[1]);