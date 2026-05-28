/*
  # Add Cover Image Fields to Profiles Table

  1. Changes
    - Add `cover_image_url` column to store the public URL for standalone race officer dashboard
    - Add `cover_image_position_x` for horizontal positioning
    - Add `cover_image_position_y` for vertical positioning  
    - Add `cover_image_scale` for zoom/scale level

  2. Notes
    - These fields allow standalone race officers to personalize their dashboard
    - Same pattern used by clubs table for club dashboard cover images
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_image_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_image_position_x'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_image_position_x NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_image_position_y'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_image_position_y NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_image_scale'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_image_scale NUMERIC DEFAULT 1;
  END IF;
END $$;