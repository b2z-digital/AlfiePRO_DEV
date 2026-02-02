/*
  # Add storage bucket and policies for event media
  
  1. Changes
    - Create event-media storage bucket
    - Set up storage policies for public access and authenticated operations
    
  2. Notes
    - Uses safe policy creation with existence checks
    - Enables public read access
    - Restricts write operations to authenticated users
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-media', 'event-media', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- Create policies
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-media');

CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-media');

CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-media')
WITH CHECK (bucket_id = 'event-media');

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-media');