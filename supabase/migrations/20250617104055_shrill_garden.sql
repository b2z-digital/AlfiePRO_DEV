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

-- Add auto_renew_enabled and renewal_notification_days to clubs table if they don't exist
DO $$ 
BEGIN
  IF NOT column_exists('clubs', 'auto_renew_enabled') THEN
    ALTER TABLE clubs ADD COLUMN auto_renew_enabled BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT column_exists('clubs', 'renewal_notification_days') THEN
    ALTER TABLE clubs ADD COLUMN renewal_notification_days INTEGER DEFAULT 30;
  END IF;
  
  -- Add renewal_mode and fixed_renewal_date if they don't exist
  IF NOT column_exists('clubs', 'renewal_mode') THEN
    ALTER TABLE clubs ADD COLUMN renewal_mode TEXT DEFAULT 'anniversary'::text;
  END IF;
  
  IF NOT column_exists('clubs', 'fixed_renewal_date') THEN
    ALTER TABLE clubs ADD COLUMN fixed_renewal_date TEXT;
  END IF;
  
  -- Check if renewal_mode constraint exists before adding it
  IF column_exists('clubs', 'renewal_mode') AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clubs_renewal_mode_check'
  ) THEN
    ALTER TABLE clubs
    ADD CONSTRAINT clubs_renewal_mode_check
    CHECK (renewal_mode = ANY (ARRAY['anniversary'::text, 'fixed'::text]));
  END IF;
END $$;

-- Drop the function after use
DROP FUNCTION IF EXISTS column_exists;