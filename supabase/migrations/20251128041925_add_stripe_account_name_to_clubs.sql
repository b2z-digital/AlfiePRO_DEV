/*
  # Add Stripe Account Name to Clubs

  1. Changes
    - Add `stripe_account_name` column to `clubs` table to store the connected Stripe account's business name
    - This improves UX by showing which Stripe account is connected

  2. Security
    - No RLS changes needed (existing policies cover this column)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'stripe_account_name'
  ) THEN
    ALTER TABLE clubs ADD COLUMN stripe_account_name text;
  END IF;
END $$;