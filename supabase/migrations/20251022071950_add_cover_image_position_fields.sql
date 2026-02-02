/*
  # Add Cover Image Position and Scale Fields

  1. Changes
    - Add `cover_image_position_x` column to `clubs` table to store horizontal position
    - Add `cover_image_position_y` column to `clubs` table to store vertical position
    - Add `cover_image_scale` column to `clubs` table to store zoom/scale level
    - Add similar fields to `state_associations` and `national_associations` tables

  2. Notes
    - These fields store the user's adjustments to the cover image display
    - Default values: x=0, y=0, scale=1 (centered, original size)
    - Position values are in pixels, scale is a multiplier (0.5-3.0 range)
*/

-- Add cover image position and scale fields to clubs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'cover_image_position_x'
  ) THEN
    ALTER TABLE clubs ADD COLUMN cover_image_position_x NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'cover_image_position_y'
  ) THEN
    ALTER TABLE clubs ADD COLUMN cover_image_position_y NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'cover_image_scale'
  ) THEN
    ALTER TABLE clubs ADD COLUMN cover_image_scale NUMERIC DEFAULT 1;
  END IF;
END $$;

-- Add cover image position and scale fields to state_associations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'cover_image_position_x'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN cover_image_position_x NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'cover_image_position_y'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN cover_image_position_y NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'state_associations' AND column_name = 'cover_image_scale'
  ) THEN
    ALTER TABLE state_associations ADD COLUMN cover_image_scale NUMERIC DEFAULT 1;
  END IF;
END $$;

-- Add cover image position and scale fields to national_associations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'national_associations' AND column_name = 'cover_image_position_x'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN cover_image_position_x NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'national_associations' AND column_name = 'cover_image_position_y'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN cover_image_position_y NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'national_associations' AND column_name = 'cover_image_scale'
  ) THEN
    ALTER TABLE national_associations ADD COLUMN cover_image_scale NUMERIC DEFAULT 1;
  END IF;
END $$;