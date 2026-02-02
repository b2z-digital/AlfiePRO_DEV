/*
  # Add Cover Image to Clubs

  1. Changes
    - Add `cover_image_url` column to `clubs` table to store club cover images
    - Column is nullable to support clubs without cover images
    
  2. Notes
    - Cover images will be stored in the existing media bucket
    - Only club admins can update the cover image
    - Images will be cached on the frontend until changed
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE clubs ADD COLUMN cover_image_url TEXT;
  END IF;
END $$;