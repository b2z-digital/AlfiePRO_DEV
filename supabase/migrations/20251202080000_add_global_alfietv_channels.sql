/*
  # Add Global AlfieTV Channels Support

  1. Changes
    - Add `is_global` flag to `alfie_tv_channels` to mark channels visible to all users
    - Add `created_by_user_id` to track who created the channel
    - Add `created_by_role` to identify if created by SuperAdmin or State Admin
    - Make `club_id` nullable since global channels don't belong to specific clubs
  
  2. Security
    - Update RLS policies to allow all authenticated users to view global channels
    - SuperAdmins and State Admins can create global channels
    - Only creators (SuperAdmins/State Admins) can update/delete global channels
*/

-- Add columns for global channel support
ALTER TABLE alfie_tv_channels 
  ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE alfie_tv_channels 
  ADD COLUMN IF NOT EXISTS is_global boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_role text;

-- Create index for global channels
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_global ON alfie_tv_channels(is_global) WHERE is_global = true;

-- Drop old channel view policy
DROP POLICY IF EXISTS "Club members can view channels" ON alfie_tv_channels;

-- Create new policy for viewing channels (club members OR global channels)
CREATE POLICY "Users can view club channels or global channels"
  ON alfie_tv_channels FOR SELECT
  TO authenticated
  USING (
    -- Global channels visible to all authenticated users
    is_global = true
    OR
    -- Club-specific channels visible to club members
    (
      club_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_clubs
        WHERE user_clubs.club_id = alfie_tv_channels.club_id
        AND user_clubs.user_id = auth.uid()
      )
    )
  );

-- Update insert policy to allow SuperAdmins and State Admins to create global channels
DROP POLICY IF EXISTS "Club admins can insert channels" ON alfie_tv_channels;

CREATE POLICY "Admins can insert channels"
  ON alfie_tv_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    -- SuperAdmins can create global channels
    (
      is_global = true
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.user_id = auth.uid()
          AND profiles.is_super_admin = true
        )
        OR EXISTS (
          SELECT 1 FROM user_state_associations
          WHERE user_state_associations.user_id = auth.uid()
          AND user_state_associations.role = 'state_admin'
        )
      )
    )
    OR
    -- Club admins can create club-specific channels
    (
      is_global = false
      AND club_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_clubs
        WHERE user_clubs.club_id = alfie_tv_channels.club_id
        AND user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'admin'
      )
    )
  );

-- Update update policy
DROP POLICY IF EXISTS "Club admins can update channels" ON alfie_tv_channels;

CREATE POLICY "Admins can update channels"
  ON alfie_tv_channels FOR UPDATE
  TO authenticated
  USING (
    -- SuperAdmins can update global channels they created
    (
      is_global = true
      AND created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.is_super_admin = true
      )
    )
    OR
    -- State Admins can update global channels they created
    (
      is_global = true
      AND created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM user_state_associations
        WHERE user_state_associations.user_id = auth.uid()
        AND user_state_associations.role = 'state_admin'
      )
    )
    OR
    -- Club admins can update their club's channels
    (
      is_global = false
      AND club_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_clubs
        WHERE user_clubs.club_id = alfie_tv_channels.club_id
        AND user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'admin'
      )
    )
  );

-- Update delete policy
DROP POLICY IF EXISTS "Club admins can delete channels" ON alfie_tv_channels;

CREATE POLICY "Admins can delete channels"
  ON alfie_tv_channels FOR DELETE
  TO authenticated
  USING (
    -- SuperAdmins can delete global channels they created
    (
      is_global = true
      AND created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.is_super_admin = true
      )
    )
    OR
    -- State Admins can delete global channels they created
    (
      is_global = true
      AND created_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM user_state_associations
        WHERE user_state_associations.user_id = auth.uid()
        AND user_state_associations.role = 'state_admin'
      )
    )
    OR
    -- Club admins can delete their club's channels
    (
      is_global = false
      AND club_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_clubs
        WHERE user_clubs.club_id = alfie_tv_channels.club_id
        AND user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'admin'
      )
    )
  );

-- Update video view policy to include videos from global channels
DROP POLICY IF EXISTS "Users can view videos from their club channels" ON alfie_tv_videos;

CREATE POLICY "Users can view videos from accessible channels"
  ON alfie_tv_videos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alfie_tv_channels
      WHERE alfie_tv_channels.id = alfie_tv_videos.channel_id
      AND (
        -- Global channel videos visible to all
        alfie_tv_channels.is_global = true
        OR
        -- Club channel videos visible to club members
        EXISTS (
          SELECT 1 FROM user_clubs
          WHERE user_clubs.club_id = alfie_tv_channels.club_id
          AND user_clubs.user_id = auth.uid()
        )
      )
    )
  );
