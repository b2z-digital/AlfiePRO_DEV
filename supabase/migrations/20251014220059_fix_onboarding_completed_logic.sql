/*
  # Fix Onboarding Completion Logic

  1. Changes
    - Reset all onboarding_completed flags to false
    - Mark only users who have club memberships as completed
    - This ensures new signups are properly required to complete onboarding

  2. Logic
    - Users with entries in user_clubs table = onboarding completed
    - Users without club memberships = need to complete onboarding
*/

-- First, reset all onboarding flags
UPDATE profiles 
SET onboarding_completed = false, 
    onboarding_completed_at = NULL;

-- Then mark users as completed ONLY if they have club memberships
UPDATE profiles 
SET onboarding_completed = true, 
    onboarding_completed_at = now()
WHERE id IN (
  SELECT DISTINCT user_id 
  FROM user_clubs
);