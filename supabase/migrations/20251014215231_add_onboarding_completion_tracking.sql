/*
  # Add Onboarding Completion Tracking

  1. Changes
    - Add `onboarding_completed` column to profiles table
    - Add `onboarding_completed_at` column to profiles table
    - Set default to false for new users
    - Update existing profiles to true (assume they've already onboarded)

  2. Security
    - Users can only update their own onboarding status
*/

-- Add onboarding tracking columns to profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed_at timestamptz;
  END IF;
END $$;

-- Mark existing users as having completed onboarding
UPDATE profiles 
SET onboarding_completed = true, 
    onboarding_completed_at = now()
WHERE onboarding_completed IS NULL OR onboarding_completed = false;