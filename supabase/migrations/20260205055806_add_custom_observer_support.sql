/*
  # Add Custom Observer Support

  1. Changes
    - Make `skipper_index` nullable in `heat_observers` table to support non-competing observers
    - Add `is_custom_observer` flag to distinguish between skipper observers and custom observers
    
  2. Notes
    - Custom observers are volunteers or non-competing individuals who can observe heats
    - They only need a name and are not linked to a skipper record
    - All existing records will have `is_custom_observer = false` by default
*/

-- Make skipper_index nullable to support custom observers
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'heat_observers' 
    AND column_name = 'skipper_index' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.heat_observers 
    ALTER COLUMN skipper_index DROP NOT NULL;
  END IF;
END $$;

-- Add flag to identify custom observers
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'heat_observers' 
    AND column_name = 'is_custom_observer'
  ) THEN
    ALTER TABLE public.heat_observers 
    ADD COLUMN is_custom_observer boolean DEFAULT false;
  END IF;
END $$;

-- Set default for existing records
UPDATE public.heat_observers 
SET is_custom_observer = false 
WHERE is_custom_observer IS NULL;