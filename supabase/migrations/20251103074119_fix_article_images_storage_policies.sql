/*
  # Fix Article Images Storage Policies
  
  1. Changes
    - Drop old policies that reference non-existent user_clubs relation
    - Create new policies that work with both clubs and associations
    - Support state and national associations
    - Allow public read access
    
  2. Security
    - Authenticated users can upload to their organization's folder
    - Only organization members can update/delete images
    - Everyone can read (public bucket)
*/

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can upload article images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update article images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete article images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view article images" ON storage.objects;

-- Allow public read access
CREATE POLICY "Anyone can view article images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'article-images');

-- Allow authenticated users to upload article images
CREATE POLICY "Authenticated users can upload article images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'article-images' AND
    (
      -- User belongs to a club
      EXISTS (
        SELECT 1 FROM user_clubs uc 
        WHERE uc.user_id = auth.uid() 
        AND uc.club_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a state association
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.state_association_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a national association
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.national_association_id::text = split_part(name, '/', 1)
      )
    )
  );

-- Allow authenticated users to update their organization's article images
CREATE POLICY "Authenticated users can update article images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'article-images' AND
    (
      -- User belongs to a club
      EXISTS (
        SELECT 1 FROM user_clubs uc 
        WHERE uc.user_id = auth.uid() 
        AND uc.club_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a state association
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.state_association_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a national association
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.national_association_id::text = split_part(name, '/', 1)
      )
    )
  );

-- Allow authenticated users to delete their organization's article images
CREATE POLICY "Authenticated users can delete article images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'article-images' AND
    (
      -- User belongs to a club
      EXISTS (
        SELECT 1 FROM user_clubs uc 
        WHERE uc.user_id = auth.uid() 
        AND uc.club_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a state association
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.state_association_id::text = split_part(name, '/', 1)
      )
      OR
      -- User belongs to a national association
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.national_association_id::text = split_part(name, '/', 1)
      )
    )
  );