/*
  # Add Missing Columns to member_boats and membership_transactions

  1. Changes
    - Add `hull_number` column to `member_boats` table (text, nullable)
    - Add `description` column to `membership_transactions` table (text, nullable)
  
  2. Purpose
    - Fix 400 errors when querying these tables with columns that don't exist yet
    - The frontend queries reference these columns but they were never created

  3. Notes
    - Both columns are nullable with no default, so existing data is unaffected
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_boats' AND column_name = 'hull_number' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.member_boats ADD COLUMN hull_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'membership_transactions' AND column_name = 'description' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.membership_transactions ADD COLUMN description text;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';