/*
  # Create event-media storage bucket
  
  1. Changes
    - Create storage bucket for event media
    - Set up appropriate access policies
    
  2. Notes
    - Uses storage API functions instead of direct table manipulation
    - Ensures proper permissions for public access and authenticated uploads
*/

-- Create the event-media bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'event-media',
    'event-media', 
    true,
    52428800, -- 50MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime']
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Not enough privileges to create bucket directly';
END $$;

-- Create policies using the storage API
SELECT storage.extension.create_policy(
  'Public read access for event-media',
  'event-media',
  'SELECT',
  'public',
  true
);

SELECT storage.extension.create_policy(
  'Authenticated users can upload to event-media',
  'event-media',
  'INSERT',
  'authenticated',
  true
);

SELECT storage.extension.create_policy(
  'Users can update their own files in event-media',
  'event-media',
  'UPDATE',
  'authenticated',
  'auth.uid()::text = owner'
);

SELECT storage.extension.create_policy(
  'Users can delete their own files in event-media',
  'event-media',
  'DELETE',
  'authenticated',
  'auth.uid()::text = owner'
);

SELECT storage.extension.create_policy(
  'Club admins can manage event media',
  'event-media',
  'ALL',
  'authenticated',
  'EXISTS (SELECT 1 FROM user_clubs uc WHERE uc.user_id = auth.uid() AND uc.role = ''admin'')'
);