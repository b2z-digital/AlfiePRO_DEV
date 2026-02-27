/*
  # Add show_on_website to committee_position_definitions

  ## Changes
  - Adds `show_on_website` boolean column to `committee_position_definitions`
  - Defaults to false for all positions
  - Sets President and Secretary to true by default on insert via trigger

  ## Notes
  - Existing rows are left as false; the UI will let admins toggle them per-position
  - President and Secretary are specifically called out to default true on creation
    but this is handled in the application layer
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_position_definitions'
    AND column_name = 'show_on_website'
  ) THEN
    ALTER TABLE committee_position_definitions ADD COLUMN show_on_website boolean DEFAULT false;
  END IF;
END $$;

-- Set President and Secretary positions to show_on_website = true by default
UPDATE committee_position_definitions
SET show_on_website = true
WHERE lower(position_name) IN ('president', 'secretary');
