/*
  # Fix Race Documents Storage Policy
  
  1. Changes
    - Update storage policy to allow uploading to club folders (not just user folders)
    - Members can upload documents to their club's folder
    
  2. Security
    - Users must be a member of the club to upload to that club's folder
    - Maintains read access for authenticated users
*/

-- Drop existing upload policy
DROP POLICY IF EXISTS "Users can upload documents for their club" ON storage.objects;

-- Create new upload policy that checks club membership
CREATE POLICY "Users can upload documents for their club"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'race-documents' AND
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id::text = (storage.foldername(name))[1]
    )
  );

-- Also update the update policy to match
DROP POLICY IF EXISTS "Users can update their uploaded documents" ON storage.objects;

CREATE POLICY "Users can update documents for their club"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'race-documents' AND
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id::text = (storage.foldername(name))[1]
    )
  );

-- Update delete policy to match
DROP POLICY IF EXISTS "Users can delete their uploaded documents" ON storage.objects;

CREATE POLICY "Users can delete documents for their club"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'race-documents' AND
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id::text = (storage.foldername(name))[1]
      AND uc.role IN ('admin', 'editor')
    )
  );
