/*
  # Add document and payment fields to race events
  
  1. Changes
    - Add document URL fields to race_series and quick_races tables
    - Add payment fields to race_series and quick_races tables
    
  2. Notes
    - Uses safe migration with existence checks
    - Adds support for Notice of Race and Sailing Instructions documents
    - Adds support for paid events with entry fees
*/

-- Add document and payment fields to race_series
DO $$ 
BEGIN
  -- Add notice_of_race_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'notice_of_race_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN notice_of_race_url TEXT;
  END IF;

  -- Add sailing_instructions_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'sailing_instructions_url'
  ) THEN
    ALTER TABLE race_series ADD COLUMN sailing_instructions_url TEXT;
  END IF;

  -- Add is_paid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'is_paid'
  ) THEN
    ALTER TABLE race_series ADD COLUMN is_paid BOOLEAN DEFAULT false;
  END IF;

  -- Add entry_fee column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'race_series' AND column_name = 'entry_fee'
  ) THEN
    ALTER TABLE race_series ADD COLUMN entry_fee NUMERIC;
  END IF;
END $$;

-- Add document and payment fields to quick_races
DO $$ 
BEGIN
  -- Add notice_of_race_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'notice_of_race_url'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN notice_of_race_url TEXT;
  END IF;

  -- Add sailing_instructions_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'sailing_instructions_url'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN sailing_instructions_url TEXT;
  END IF;

  -- Add is_paid column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'is_paid'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN is_paid BOOLEAN DEFAULT false;
  END IF;

  -- Add entry_fee column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'entry_fee'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN entry_fee NUMERIC;
  END IF;
END $$;

-- Create storage bucket for event documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-documents', 'event-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for event documents
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Public Documents Access'
  ) THEN
    CREATE POLICY "Public Documents Access"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'event-documents');
  END IF;

  -- Authenticated upload access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Authenticated Documents Upload'
  ) THEN
    CREATE POLICY "Authenticated Documents Upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'event-documents');
  END IF;

  -- Authenticated delete access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname = 'Authenticated Documents Delete'
  ) THEN
    CREATE POLICY "Authenticated Documents Delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'event-documents');
  END IF;
END $$;