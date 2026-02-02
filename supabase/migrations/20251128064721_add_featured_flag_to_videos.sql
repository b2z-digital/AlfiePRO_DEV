/*
  # Add Featured Flag to Videos

  1. Changes
    - Add is_featured boolean column to alfie_tv_videos
    - Add index for faster featured video queries
    - Add is_visible column to Channel interface tracking
*/

-- Add featured flag to videos
ALTER TABLE alfie_tv_videos
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

-- Add index for featured videos
CREATE INDEX IF NOT EXISTS idx_alfie_tv_videos_featured ON alfie_tv_videos(is_featured, published_at DESC) WHERE is_featured = true;

-- Update Channel interface to ensure is_visible is properly tracked
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_visible_priority ON alfie_tv_channels(is_visible, priority DESC);
