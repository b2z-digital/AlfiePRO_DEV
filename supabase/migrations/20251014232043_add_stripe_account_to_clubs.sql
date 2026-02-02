/*
  # Add Stripe Account ID to Clubs

  1. Changes
    - Add `stripe_account_id` column to clubs table to store Stripe Connect account IDs
    - This enables clubs to receive direct payments from member onboarding

  2. Notes
    - Column is nullable as not all clubs may have Stripe configured
    - When populated, the onboarding flow will show card payment option
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'stripe_account_id'
  ) THEN
    ALTER TABLE clubs ADD COLUMN stripe_account_id text;
  END IF;
END $$;