/*
  # Add Missing Columns to race_series Table

  1. Changes
    - Add `club_name` column if it doesn't exist
    - Add `race_class` column if it doesn't exist
    - Add `rounds` column if it doesn't exist (for storing round data)
    - Add `completed` column if it doesn't exist
    - Add `media` column if it doesn't exist
    - Add document and payment columns if they don't exist
    
  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - These columns are needed for race series to function properly
*/

-- Add club_name column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'club_name'
  ) THEN
    ALTER TABLE race_series ADD COLUMN club_name TEXT;
  END IF;
END $$;

-- Add race_class column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'race_class'
  ) THEN
    ALTER TABLE race_series ADD COLUMN race_class TEXT;
  END IF;
END $$;

-- Add rounds column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'rounds'
  ) THEN
    ALTER TABLE race_series ADD COLUMN rounds JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add completed column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'completed'
  ) THEN
    ALTER TABLE race_series ADD COLUMN completed BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add media column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'media'
  ) THEN
    ALTER TABLE race_series ADD COLUMN media JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add notice_of_race_url column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'notice_of_race_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN notice_of_race_url TEXT;
  END IF;
END $$;

-- Add sailing_instructions_url column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'sailing_instructions_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN sailing_instructions_url TEXT;
  END IF;
END $$;

-- Add is_paid column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'is_paid'
  ) THEN
    ALTER TABLE race_series ADD COLUMN is_paid BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add entry_fee column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'entry_fee'
  ) THEN
    ALTER TABLE race_series ADD COLUMN entry_fee NUMERIC(10, 2);
  END IF;
END $$;