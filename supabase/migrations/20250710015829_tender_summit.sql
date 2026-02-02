/*
  # Add missing columns to club_finance_settings table

  1. Schema Changes
    - Add `deposit_prefix` column with default 'DEP-'
    - Add `deposit_next_number` column with default 1
    - Add `expense_prefix` column with default 'EXP-'
    - Add `expense_next_number` column with default 1
    - Add `invoice_logo_url` column for storing logo URLs
    - Rename `number_prefix` to `invoice_prefix` for consistency
    - Rename `next_number_starts_from` to `invoice_next_number` for consistency

  2. Data Migration
    - Preserve existing data during column renames
    - Set appropriate defaults for new columns
*/

-- Add new columns for deposit settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'deposit_prefix'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN deposit_prefix text DEFAULT 'DEP-'::text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'deposit_next_number'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN deposit_next_number integer DEFAULT 1;
  END IF;
END $$;

-- Add new columns for expense settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'expense_prefix'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN expense_prefix text DEFAULT 'EXP-'::text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'expense_next_number'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN expense_next_number integer DEFAULT 1;
  END IF;
END $$;

-- Add invoice logo URL column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'invoice_logo_url'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN invoice_logo_url text;
  END IF;
END $$;

-- Rename existing columns for consistency
DO $$
BEGIN
  -- Rename number_prefix to invoice_prefix
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'number_prefix'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'invoice_prefix'
  ) THEN
    ALTER TABLE club_finance_settings RENAME COLUMN number_prefix TO invoice_prefix;
  END IF;
END $$;

DO $$
BEGIN
  -- Rename next_number_starts_from to invoice_next_number
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'next_number_starts_from'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'invoice_next_number'
  ) THEN
    ALTER TABLE club_finance_settings RENAME COLUMN next_number_starts_from TO invoice_next_number;
  END IF;
END $$;

-- If the columns already exist with the new names, add them if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'invoice_prefix'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN invoice_prefix text DEFAULT 'INV-'::text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_finance_settings' AND column_name = 'invoice_next_number'
  ) THEN
    ALTER TABLE club_finance_settings ADD COLUMN invoice_next_number integer DEFAULT 1;
  END IF;
END $$;