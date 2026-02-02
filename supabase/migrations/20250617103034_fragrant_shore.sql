/*
  # Add user avatar storage

  1. New Storage
    - Creates a storage bucket for user avatars
    - Sets up appropriate public access
  2. Security
    - Configures storage permissions for user avatars
*/

-- Create storage bucket for user avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for the user-avatars bucket
-- Using storage.objects instead of storage.policies
CREATE POLICY "Avatar Storage Policy" 
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add public read access to avatars
CREATE POLICY "Public Avatar Access Policy"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'user-avatars');

-- Note: avatar_url will be stored in user_metadata which is a JSONB column
-- and doesn't require schema changes