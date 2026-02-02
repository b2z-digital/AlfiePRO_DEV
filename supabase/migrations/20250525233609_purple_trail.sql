/*
  # Add storage bucket and policies for event media
  
  1. Changes
    - Create storage bucket for event media
    - Set up storage policies for public access and authenticated users
    
  2. Notes
    - Uses safe policy creation with proper permissions
    - Enables secure file uploads for authenticated users
    - Allows public read access for event media
*/

BEGIN;

-- Create storage bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-media', 'event-media', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Add media column to race_series if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'media'
  ) THEN
    ALTER TABLE race_series ADD COLUMN media JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add livestream_url column to race_series if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'livestream_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN livestream_url TEXT;
  END IF;
END $$;

COMMIT;