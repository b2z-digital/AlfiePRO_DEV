/*
  # Add image position support to member_boats
  
  1. Changes
    - Add `image_position` column to store image crop/zoom position data
    - Add `uploaded_by` column to boat_images if missing
  
  2. Details
    - `image_position` stores x, y, and scale values as JSONB
    - Allows images to be positioned/cropped for display
*/

-- Add image_position column to member_boats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'member_boats' AND column_name = 'image_position'
  ) THEN
    ALTER TABLE member_boats ADD COLUMN image_position jsonb DEFAULT '{"x": 0, "y": 0, "scale": 1}'::jsonb;
  END IF;
END $$;

-- Add uploaded_by column to boat_images if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boat_images' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE boat_images ADD COLUMN uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
