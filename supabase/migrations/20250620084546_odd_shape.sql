/*
  # Add user avatars storage bucket
  
  1. Changes
    - Create storage bucket for user avatars
    - Set up storage policies for user avatar uploads and access
    
  2. Notes
    - Uses safe policy creation with existence checks
    - Enables public read access for avatars
    - Restricts write operations to authenticated users for their own avatars
*/

-- Create storage bucket for user avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "User Avatar Storage Policy" ON storage.objects;
  DROP POLICY IF EXISTS "Public Avatar Access Policy" ON storage.objects;
END $$;

-- Create policy for authenticated users to manage their own avatars
CREATE POLICY "User Avatar Storage Policy" 
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'user-avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create policy for public read access to avatars
CREATE POLICY "Public Avatar Access Policy"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'user-avatars');