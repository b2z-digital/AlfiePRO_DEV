/*
  # Add spreadsheet to scoring mode preference constraint

  1. Changes
    - Update CHECK constraint on profiles.scoring_mode_preference to allow 'spreadsheet' value
    - Previously only allowed 'pro' and 'touch'

  2. Notes
    - This enables the spreadsheet scoring mode to be persisted as a user preference
    - Without this fix, saving spreadsheet mode from race settings would silently fail
*/

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_scoring_mode_preference_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_scoring_mode_preference_check
  CHECK (scoring_mode_preference IN ('pro', 'touch', 'spreadsheet'));