/*
  # Add video_count column to alfie_tv_channels
  
  1. Changes
    - Add video_count column to track number of videos per channel
    - Set default value to 0
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'video_count'
  ) THEN
    ALTER TABLE alfie_tv_channels ADD COLUMN video_count integer DEFAULT 0;
  END IF;
END $$;