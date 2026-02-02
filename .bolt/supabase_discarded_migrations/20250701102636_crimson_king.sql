/*
  # Create event-media storage bucket

  1. Storage Setup
    - Create `event-media` bucket for storing event photos and media
    - Enable public access for the bucket
    - Set up RLS policies for secure access

  2. Security
    - Allow public read access to media files
    - Allow authenticated users to upload files
    - Allow users to delete their own uploaded files
*/

-- Create the event-media bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the storage.objects table (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy to allow public read access to event-media files
CREATE POLICY "Public read access for event-media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-media');

-- Policy to allow authenticated users to upload files to event-media
CREATE POLICY "Authenticated users can upload to event-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-media');

-- Policy to allow users to update their own files
CREATE POLICY "Users can update their own files in event-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = owner)
WITH CHECK (bucket_id = 'event-media' AND auth.uid()::text = owner);

-- Policy to allow users to delete their own files
CREATE POLICY "Users can delete their own files in event-media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'event-media' AND auth.uid()::text = owner);

-- Policy to allow club admins to manage all files in their events
CREATE POLICY "Club admins can manage event media"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'event-media' AND
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = auth.uid() 
    AND uc.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'event-media' AND
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.user_id = auth.uid() 
    AND uc.role = 'admin'
  )
);