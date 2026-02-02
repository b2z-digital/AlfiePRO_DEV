/*
  # Add full_name column to profiles

  1. Problem
    - Social system queries use full_name but profiles table only has first_name and last_name
    - This causes 400 errors when trying to fetch profiles
    
  2. Solution
    - Add full_name as a generated column that concatenates first_name and last_name
    - This makes it backward compatible with all existing social queries

  3. Changes
    - Add full_name generated column
    - Backfill existing profiles
*/

-- Add full_name as a generated column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name text 
GENERATED ALWAYS AS (
  CASE 
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL 
      THEN first_name || ' ' || last_name
    WHEN first_name IS NOT NULL 
      THEN first_name
    WHEN last_name IS NOT NULL 
      THEN last_name
    ELSE ''
  END
) STORED;

-- Create index for searching
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);
