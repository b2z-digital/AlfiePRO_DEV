/*
  # Add UI Preferences to Profiles
  
  1. Changes
    - Add `ui_preferences` JSONB column to profiles table to store user interface preferences
    - This will store settings like sidebar collapsed state, theme preferences, etc.
  
  2. Notes
    - Uses JSONB for flexible storage of various UI preferences
    - Default is empty object
*/

-- Add ui_preferences column to profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'ui_preferences'
  ) THEN
    ALTER TABLE profiles ADD COLUMN ui_preferences JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;