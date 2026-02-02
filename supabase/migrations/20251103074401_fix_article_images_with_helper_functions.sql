/*
  # Fix Article Images Storage with Helper Functions
  
  1. Changes
    - Create helper functions with explicit search_path
    - These functions check if user has access to upload to a folder
    - Recreate policies using these helper functions
    
  2. Security
    - Functions use SECURITY DEFINER to ensure they run with correct permissions
    - Explicit search_path prevents schema resolution issues
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view article images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload article images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update article images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete article images" ON storage.objects;

-- Create helper function to check article image access
CREATE OR REPLACE FUNCTION public.user_can_access_article_folder(folder_id text, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN (
    -- User belongs to a club with this ID
    EXISTS (
      SELECT 1 FROM public.user_clubs uc 
      WHERE uc.user_id = user_can_access_article_folder.user_id 
      AND uc.club_id::text = folder_id
    )
    OR
    -- User belongs to a state association with this ID
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = user_can_access_article_folder.user_id
      AND usa.state_association_id::text = folder_id
    )
    OR
    -- User belongs to a national association with this ID
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = user_can_access_article_folder.user_id
      AND una.national_association_id::text = folder_id
    )
  );
END;
$$;

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
    public.user_can_access_article_folder(
      split_part(name, '/', 1),
      auth.uid()
    )
  );

-- Allow authenticated users to update their organization's article images
CREATE POLICY "Authenticated users can update article images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'article-images' AND
    public.user_can_access_article_folder(
      split_part(name, '/', 1),
      auth.uid()
    )
  );

-- Allow authenticated users to delete their organization's article images
CREATE POLICY "Authenticated users can delete article images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'article-images' AND
    public.user_can_access_article_folder(
      split_part(name, '/', 1),
      auth.uid()
    )
  );