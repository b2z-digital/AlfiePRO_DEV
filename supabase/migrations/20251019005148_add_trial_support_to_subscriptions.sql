/*
  # Add Trial Support to User Subscriptions

  1. Changes to user_subscriptions table
    - Add `club_id` column to link subscriptions to clubs
    - Add `trial_end_date` column to track when trial period ends
    - Update status constraint to include 'trialing' status
    - Add index on club_id for performance

  2. Security
    - Maintains existing RLS policies
    - Adds club_id to allow filtering subscriptions by club
*/

-- Add club_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_subscriptions' AND column_name = 'club_id'
  ) THEN
    ALTER TABLE public.user_subscriptions 
    ADD COLUMN club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add trial_end_date column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_subscriptions' AND column_name = 'trial_end_date'
  ) THEN
    ALTER TABLE public.user_subscriptions 
    ADD COLUMN trial_end_date TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Drop the old status constraint if it exists
ALTER TABLE public.user_subscriptions 
DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

-- Add new status constraint that includes 'trialing'
ALTER TABLE public.user_subscriptions 
ADD CONSTRAINT user_subscriptions_status_check
CHECK (status IN ('pending', 'active', 'trialing', 'inactive', 'cancelled', 'past_due'));

-- Create index on club_id for better query performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_club_id 
ON public.user_subscriptions(club_id);

-- Create index on trial_end_date for checking expiring trials
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial_end 
ON public.user_subscriptions(trial_end_date) 
WHERE trial_end_date IS NOT NULL;