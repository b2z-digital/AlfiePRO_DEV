/*
  # Add media column to quick_races table
  
  1. Changes
    - Add media JSONB column to quick_races table
    - Add media_url column to quick_races table
    
  2. Notes
    - Uses safe migration with existence checks
    - Adds JSONB array for media items
    - Adds text field for media URL
*/

-- Add media column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'media'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN media JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add media_url column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN media_url TEXT;
  END IF;
END $$;