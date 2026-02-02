/*
  # Fix Avatar Upload RLS Policies

  1. Storage Policies
    - Enable RLS on storage.objects if not already enabled
    - Add policies for authenticated users to upload/update/delete their own avatars
    - Add policy for public read access to avatars

  2. Profile Table Policies
    - Ensure users can update their own profile including avatar_url
*/

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing avatar policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;

-- Create storage policies for avatars bucket
CREATE POLICY "Users can upload their own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public can view avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Ensure the avatars bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure profiles table has proper RLS policies for avatar updates
-- (The existing policies should already allow this, but let's make sure)
DO $$
BEGIN
  -- Check if the policy exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
    ON profiles
    FOR UPDATE
    TO authenticated
    USING (uid() = id)
    WITH CHECK (uid() = id);
  END IF;
END $$;