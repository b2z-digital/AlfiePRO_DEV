/*
  # Add is_homepage_media flag to event_media table

  1. Changes
    - Add `is_homepage_media` boolean column to `event_media` table
    - Default to false for existing records
    - Update existing homepage images to be marked as homepage media

  2. Purpose
    - Separate homepage carousel/tile images from general media center content
    - Prevent homepage management images from appearing in the main media center
*/

-- Add the is_homepage_media column
ALTER TABLE event_media 
ADD COLUMN IF NOT EXISTS is_homepage_media BOOLEAN DEFAULT false;

-- Mark existing homepage images (those with titles like slide1_bg, slide2_bg, etc.)
UPDATE event_media
SET is_homepage_media = true
WHERE title SIMILAR TO '%(slide|tile)%_bg%'
   OR title SIMILAR TO '%(slide|tile)[0-9]+_bg%';

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_event_media_is_homepage_media 
ON event_media(is_homepage_media) 
WHERE is_homepage_media = false;