/*
  # Add media column to quick_races table

  1. Changes
    - Add `media` column to `quick_races` table
    - Column type: JSONB with default empty array
    - Allow NULL values for backward compatibility

  2. Security
    - No RLS changes needed as existing policies will apply to the new column
*/

-- Add media column to quick_races table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'media'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN media jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;