/*
  # Add bank detail columns to association_finance_settings

  1. Modified Tables
    - `association_finance_settings`
      - Added `bank_name` (text) - Name of the bank
      - Added `bsb` (text) - Bank State Branch number
      - Added `account_number` (text) - Bank account number

  2. Notes
    - These columns allow state/national associations to store structured bank details
    - Previously bank details were only storable as formatted text in payment_information
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN bank_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'bsb'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN bsb text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_finance_settings' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE association_finance_settings ADD COLUMN account_number text DEFAULT '';
  END IF;
END $$;
