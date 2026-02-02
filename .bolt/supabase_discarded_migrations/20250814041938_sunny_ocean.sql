/*
  # Add heat management configuration column

  1. Schema Changes
    - Add `heat_management_config` column to `race_series` table
    - Column type: JSONB to store heat racing configuration data
  
  2. Purpose
    - Separates heat management configuration from rounds data
    - Prevents schema validation errors when storing race series with heat racing
    - Maintains backwards compatibility with existing race series
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'heat_management_config'
  ) THEN
    ALTER TABLE race_series ADD COLUMN heat_management_config JSONB;
  END IF;
END $$;