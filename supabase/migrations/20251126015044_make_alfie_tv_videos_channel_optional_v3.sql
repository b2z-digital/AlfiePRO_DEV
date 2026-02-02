/*
  # Make channel_id optional for standalone videos

  1. Changes
    - Make `channel_id` nullable in `alfie_tv_videos` table
    - This allows videos to exist without being part of a YouTube channel
    - Standalone videos can be organized via playlists or shown in a dedicated section

  2. Security
    - Update RLS policies to allow standalone videos (channel_id IS NULL)
    - Simplified policies for authenticated users and admins
*/

-- Make channel_id nullable
ALTER TABLE alfie_tv_videos 
  ALTER COLUMN channel_id DROP NOT NULL;

-- Update RLS policies to handle standalone videos

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view videos from their club's channels" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can insert videos" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can update videos" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can delete videos" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Users can view videos from their club's channels or standalone" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can insert videos including standalone" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can update videos including standalone" ON alfie_tv_videos;
DROP POLICY IF EXISTS "Admins can delete videos including standalone" ON alfie_tv_videos;

-- Recreate simple policies
-- Allow all authenticated users to view videos (standalone or from channels)
CREATE POLICY "Users can view all videos"
  ON alfie_tv_videos FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to manage videos
CREATE POLICY "Admins can insert videos"
  ON alfie_tv_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin', 'national_admin', 'state_admin')
    )
  );

CREATE POLICY "Admins can update videos"
  ON alfie_tv_videos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin', 'national_admin', 'state_admin')
    )
  );

CREATE POLICY "Admins can delete videos"
  ON alfie_tv_videos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'super_admin', 'national_admin', 'state_admin')
    )
  );