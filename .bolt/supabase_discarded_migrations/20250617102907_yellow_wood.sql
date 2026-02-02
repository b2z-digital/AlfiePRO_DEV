-- Create storage bucket for user avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for the user-avatars bucket
INSERT INTO storage.policies (name, definition, bucket_id)
VALUES 
  ('Avatar Storage Policy', '(bucket_id = ''user-avatars''::text AND (storage.foldername(name))[1] = auth.uid()::text)', 'user-avatars')
ON CONFLICT (name, bucket_id) DO NOTHING;

-- Add avatar_url to auth.users metadata if not already present
DO $$
BEGIN
  -- This is a no-op as we can't directly modify auth.users schema
  -- The avatar_url will be stored in user_metadata which is a JSONB column
  -- and doesn't require schema changes
  NULL;
END $$;