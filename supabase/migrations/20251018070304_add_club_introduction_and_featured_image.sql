/*
  # Add Club Introduction and Featured Image Fields

  1. Changes to clubs table
    - Add `club_introduction` column (text, optional)
      - Stores club introduction text (max 600 words)
      - To be displayed on club home page
    - Add `featured_image_url` column (text, optional)
      - Stores URL to club's featured/cover image
      - To be used on club home page and dashboard header

  2. Notes
    - Both fields are optional to maintain backward compatibility
    - No data migration needed for existing clubs
    - Fields can be updated through the Club settings tab
*/

-- Add club introduction field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'club_introduction'
  ) THEN
    ALTER TABLE clubs ADD COLUMN club_introduction text;
  END IF;
END $$;

-- Add featured image URL field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'featured_image_url'
  ) THEN
    ALTER TABLE clubs ADD COLUMN featured_image_url text;
  END IF;
END $$;
