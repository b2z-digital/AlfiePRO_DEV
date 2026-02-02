/*
  # Add missing fields to quick_races table
  
  1. Changes
    - Add `event_name` column to store the specific event name
    - Add `is_interclub` column to indicate multi-club events
    - Add `other_club_id` column to reference the other club in interclub events
    - Add `other_club_name` column to store the name of the other club
    
  2. Notes
    - Uses safe migration with existence checks
    - Adds proper column types with appropriate defaults
    - Maintains backward compatibility
*/

-- Add event_name column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'event_name'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN event_name TEXT;
  END IF;
END $$;

-- Add is_interclub column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'is_interclub'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN is_interclub BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add other_club_id column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'other_club_id'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN other_club_id UUID;
  END IF;
END $$;

-- Add other_club_name column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'other_club_name'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN other_club_name TEXT;
  END IF;
END $$;

-- Add multi_day column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'multi_day'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN multi_day BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add number_of_days column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'number_of_days'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN number_of_days INTEGER DEFAULT 1;
  END IF;
END $$;

-- Add end_date column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN end_date TEXT;
  END IF;
END $$;

-- Add day_results column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'day_results'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN day_results JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add current_day column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'current_day'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN current_day INTEGER DEFAULT 1;
  END IF;
END $$;

-- Add heat_management column to quick_races if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_races' AND column_name = 'heat_management'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN heat_management JSONB;
  END IF;
END $$;