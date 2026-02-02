/*
  # Add Abbreviation to Association Tables

  1. Changes
    - Add abbreviation column to state_associations table
    - Add abbreviation column to national_associations table
    - These will be used for short display names (e.g., "NSWRYA" instead of "New South Wales Radio Yacht Association")
    
  2. Notes
    - Column is optional (nullable) to allow gradual population
    - Can be populated later through association settings
*/

-- Add abbreviation to state associations
ALTER TABLE state_associations 
ADD COLUMN IF NOT EXISTS abbreviation text;

-- Add abbreviation to national associations  
ALTER TABLE national_associations
ADD COLUMN IF NOT EXISTS abbreviation text;