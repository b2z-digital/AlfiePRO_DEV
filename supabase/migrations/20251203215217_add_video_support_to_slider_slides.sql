/*
  # Add Video Support to Slider Slides

  1. Changes
    - Add `media_type` column (image or video)
    - Add `video_url` column for YouTube URLs
    - Set default media_type to 'image' for existing slides
  
  2. Notes
    - Backward compatible with existing image slides
    - Supports YouTube embed URLs
*/

-- Add media_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_slider_slides' AND column_name = 'media_type'
  ) THEN
    ALTER TABLE event_slider_slides ADD COLUMN media_type text DEFAULT 'image';
  END IF;
END $$;

-- Add video_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_slider_slides' AND column_name = 'video_url'
  ) THEN
    ALTER TABLE event_slider_slides ADD COLUMN video_url text;
  END IF;
END $$;