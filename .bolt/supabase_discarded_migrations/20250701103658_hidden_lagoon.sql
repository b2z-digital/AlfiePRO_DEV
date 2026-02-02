/*
  # Create Storage Buckets for Media Upload

  1. New Storage Buckets
    - `event-media` - For storing event-related media files (images, videos, documents)
    - `public` - For storing general public files

  2. Security
    - Enable public access for both buckets
    - Add policies for authenticated users to upload files
    - Add policies for public read access to files
    - Add policies for users to manage their own uploaded files

  3. Configuration
    - Set appropriate file size limits
    - Configure allowed file types for media uploads
*/

-- Create the event-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Create the public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public',
  'public',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for event-media bucket

-- Allow public read access to event-media files
CREATE POLICY "Public can view event media files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-media');

-- Allow authenticated users to upload to event-media
CREATE POLICY "Authenticated users can upload event media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-media');

-- Allow users to update their own uploaded files in event-media
CREATE POLICY "Users can update their own event media files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = owner)
WITH CHECK (bucket_id = 'event-media' AND auth.uid()::text = owner);

-- Allow users to delete their own uploaded files in event-media
CREATE POLICY "Users can delete their own event media files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = owner);

-- Storage policies for public bucket

-- Allow public read access to public files
CREATE POLICY "Public can view public files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'public');

-- Allow authenticated users to upload to public bucket
CREATE POLICY "Authenticated users can upload public files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public');

-- Allow users to update their own uploaded files in public bucket
CREATE POLICY "Users can update their own public files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'public' AND auth.uid()::text = owner)
WITH CHECK (bucket_id = 'public' AND auth.uid()::text = owner);

-- Allow users to delete their own uploaded files in public bucket
CREATE POLICY "Users can delete their own public files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'public' AND auth.uid()::text = owner);