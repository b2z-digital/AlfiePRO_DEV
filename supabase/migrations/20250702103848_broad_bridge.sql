/*
  # Create article-images storage bucket

  1. New Storage Bucket
    - `article-images` bucket for storing article cover images
    - Public read access for viewing images
    - Authenticated write access for uploading images

  2. Security
    - RLS policies for authenticated users to upload
    - Public read access for viewing published images
    - Club-based organization with folder structure
*/

-- Create the article-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'article-images',
  'article-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Allow authenticated users to upload images to their club folders
CREATE POLICY "Authenticated users can upload article images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'article-images' AND
  -- Ensure the path starts with a club ID that the user belongs to
  EXISTS (
    SELECT 1 FROM user_clubs uc 
    WHERE uc.user_id = auth.uid() 
    AND uc.club_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated users to update images in their club folders
CREATE POLICY "Authenticated users can update article images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'article-images' AND
  EXISTS (
    SELECT 1 FROM user_clubs uc 
    WHERE uc.user_id = auth.uid() 
    AND uc.club_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated users to delete images in their club folders
CREATE POLICY "Authenticated users can delete article images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'article-images' AND
  EXISTS (
    SELECT 1 FROM user_clubs uc 
    WHERE uc.user_id = auth.uid() 
    AND uc.club_id::text = split_part(name, '/', 1)
  )
);

-- Allow public read access to all images in the bucket
CREATE POLICY "Public can view article images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'article-images');