-- Create function to check if column exists
CREATE OR REPLACE FUNCTION column_exists(tbl text, col text) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = tbl
    AND column_name = col
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to check if constraint exists
CREATE OR REPLACE FUNCTION constraint_exists(con_name text) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT FROM pg_constraint 
    WHERE conname = con_name
  );
END;
$$ LANGUAGE plpgsql;

-- Add required columns to clubs table if they don't exist
DO $$ 
BEGIN
  -- Add code_of_conduct column if it doesn't exist
  IF NOT column_exists('clubs', 'code_of_conduct') THEN
    ALTER TABLE clubs ADD COLUMN code_of_conduct TEXT;
  END IF;
  
  -- Add renewal_mode column if it doesn't exist
  IF NOT column_exists('clubs', 'renewal_mode') THEN
    ALTER TABLE clubs ADD COLUMN renewal_mode TEXT DEFAULT 'anniversary'::text;
  END IF;
  
  -- Add fixed_renewal_date column if it doesn't exist
  IF NOT column_exists('clubs', 'fixed_renewal_date') THEN
    ALTER TABLE clubs ADD COLUMN fixed_renewal_date TEXT DEFAULT '07-01'::text;
  END IF;
  
  -- Add auto_renew_enabled column if it doesn't exist
  IF NOT column_exists('clubs', 'auto_renew_enabled') THEN
    ALTER TABLE clubs ADD COLUMN auto_renew_enabled BOOLEAN DEFAULT false;
  END IF;
  
  -- Add renewal_notification_days column if it doesn't exist
  IF NOT column_exists('clubs', 'renewal_notification_days') THEN
    ALTER TABLE clubs ADD COLUMN renewal_notification_days INTEGER DEFAULT 30;
  END IF;
  
  -- Add renewal_mode constraint if it doesn't exist
  IF column_exists('clubs', 'renewal_mode') AND NOT constraint_exists('clubs_renewal_mode_check') THEN
    ALTER TABLE clubs
    ADD CONSTRAINT clubs_renewal_mode_check
    CHECK (renewal_mode = ANY (ARRAY['anniversary'::text, 'fixed'::text]));
  END IF;
END $$;

-- Drop the helper functions after use
DROP FUNCTION IF EXISTS column_exists;
DROP FUNCTION IF EXISTS constraint_exists;