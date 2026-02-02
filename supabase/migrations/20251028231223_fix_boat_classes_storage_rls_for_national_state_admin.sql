/*
  # Fix boat-classes storage RLS policies for national_admin and state_admin roles
  
  1. Changes
    - Update storage policies to accept both 'admin' and 'national_admin'/'state_admin' roles
    - Allows users with national_admin or state_admin roles to upload, update, and delete boat class images
    
  2. Reason
    - Users with 'national_admin' or 'state_admin' roles should be able to manage boat class images
    - Previous policies only checked for 'admin' role
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Association admins can upload boat class images" ON storage.objects;
DROP POLICY IF EXISTS "Association admins can update boat class images" ON storage.objects;
DROP POLICY IF EXISTS "Association admins can delete boat class images" ON storage.objects;

-- Recreate upload policy
CREATE POLICY "Association admins can upload boat class images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'boat-classes'
    AND (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role IN ('admin', 'national_admin')
      )
      OR EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role IN ('admin', 'state_admin')
      )
    )
  );

-- Recreate update policy
CREATE POLICY "Association admins can update boat class images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'boat-classes'
    AND (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role IN ('admin', 'national_admin')
      )
      OR EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role IN ('admin', 'state_admin')
      )
    )
  )
  WITH CHECK (bucket_id = 'boat-classes');

-- Recreate delete policy
CREATE POLICY "Association admins can delete boat class images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'boat-classes'
    AND (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.role IN ('admin', 'national_admin')
      )
      OR EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.role IN ('admin', 'state_admin')
      )
    )
  );
