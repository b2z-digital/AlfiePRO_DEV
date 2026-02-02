/*
  # Add Opening Balance to Club Finance Settings

  1. Changes
    - Add `opening_balance` column to `club_finance_settings` table
    - Add `opening_balance_date` column to track when the opening balance was set
    - Default opening balance is 0.00
    - Opening balance date defaults to null (can be set when user enters their opening balance)

  2. Purpose
    - Allow clubs to set their starting bank balance when they begin using Alfie
    - Enables accurate financial tracking and bank reconciliation
    - Shows proper current balance by adding opening balance to transaction totals
*/

-- Add opening_balance column to club_finance_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'club_finance_settings'
    AND column_name = 'opening_balance'
  ) THEN
    ALTER TABLE public.club_finance_settings
    ADD COLUMN opening_balance numeric(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- Add opening_balance_date column to track when the opening balance was set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'club_finance_settings'
    AND column_name = 'opening_balance_date'
  ) THEN
    ALTER TABLE public.club_finance_settings
    ADD COLUMN opening_balance_date date DEFAULT NULL;
  END IF;
END $$;

-- Add comment to explain the columns
COMMENT ON COLUMN public.club_finance_settings.opening_balance IS 'Starting bank balance when club begins using Alfie for financial tracking';
COMMENT ON COLUMN public.club_finance_settings.opening_balance_date IS 'Date when the opening balance was recorded';