/*
  # Add Country and Category Fields to Members

  1. New Columns
    - `country` (text) - Country name or code for international events
    - `country_code` (text) - ISO 3166-1 alpha-2 country code for flags
    - `category` (text) - Competitor category (e.g., Junior, Senior, Master, Pro, Amateur)

  2. Changes
    - Add country and country_code columns to members table
    - Add category column to members table
    - Set default country_code to 'AU' for Australian clubs

  3. Notes
    - Country codes follow ISO 3166-1 alpha-2 standard
    - Category field is flexible text for different competition categories
*/

DO $$
BEGIN
  -- Add country column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'country'
  ) THEN
    ALTER TABLE members ADD COLUMN country TEXT;
  END IF;

  -- Add country_code column (ISO 3166-1 alpha-2)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE members ADD COLUMN country_code TEXT DEFAULT 'AU';
  END IF;

  -- Add category column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'category'
  ) THEN
    ALTER TABLE members ADD COLUMN category TEXT;
  END IF;
END $$;