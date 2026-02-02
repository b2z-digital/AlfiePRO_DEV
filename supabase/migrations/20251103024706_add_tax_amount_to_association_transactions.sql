/*
  # Add Tax Amount to Association Transactions

  1. Changes
    - Add `tax_amount` column to `association_transactions` table
    - This allows tracking tax on expenses and deposits
    - Defaults to 0 for existing records

  2. Notes
    - Matches the structure of `transactions` table used by clubs
    - Enables tax calculations and reporting for associations
*/

-- Add tax_amount column to association_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_transactions' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE association_transactions ADD COLUMN tax_amount numeric(10, 2) DEFAULT 0 NOT NULL;
  END IF;
END $$;
