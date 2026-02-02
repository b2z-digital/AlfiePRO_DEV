/*
  # Add Scoring Mode Preference to Profiles

  1. Changes
    - Add `scoring_mode_preference` column to profiles table
    - Default to 'pro' for existing users
    - Options: 'pro' (current table mode) or 'touch' (new simplified mode)

  2. Notes
    - This allows race officers to save their preferred scoring interface
    - Preference persists across sessions
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'scoring_mode_preference'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN scoring_mode_preference text DEFAULT 'pro' CHECK (scoring_mode_preference IN ('pro', 'touch'));
  END IF;
END $$;