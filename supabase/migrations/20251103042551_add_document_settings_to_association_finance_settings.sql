/*
  # Add document settings to association finance settings

  1. Changes
    - Add missing columns to association_finance_settings table:
      - `invoice_title` (text, default 'INVOICE')
      - `organization_number` (text)
      - `deposit_prefix` (text, default 'DEP-')
      - `expense_prefix` (text, default 'EXP-')
      - `deposit_next_number` (integer, default 1)
      - `expense_next_number` (integer, default 1)
      - `footer_information` (text)
      - `payment_information` (text)

  2. Notes
    - These fields match the club_finance_settings table structure
    - Allows associations to configure document formatting for invoices, expenses, and deposits
*/

-- Add missing columns to association_finance_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'invoice_title'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN invoice_title text DEFAULT 'INVOICE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'organization_number'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN organization_number text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'deposit_prefix'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN deposit_prefix text DEFAULT 'DEP-';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'expense_prefix'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN expense_prefix text DEFAULT 'EXP-';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'deposit_next_number'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN deposit_next_number integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'expense_next_number'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN expense_next_number integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'footer_information'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN footer_information text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'payment_information'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN payment_information text DEFAULT '';
  END IF;
END $$;