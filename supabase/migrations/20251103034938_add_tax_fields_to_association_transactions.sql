/*
  # Add Tax Tracking Fields to Association Transactions

  1. Changes
    - Add `tax_rate_id` column to reference which tax rate was used
    - Add `tax_type` column to track if tax was 'included', 'excluded', or 'none'
  
  2. Purpose
    - Enable proper tax persistence and editing for expenses and deposits
    - Allow users to see which tax was applied when editing transactions
*/

-- Add tax_rate_id column to association_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_transactions' AND column_name = 'tax_rate_id'
  ) THEN
    ALTER TABLE association_transactions
    ADD COLUMN tax_rate_id uuid REFERENCES association_tax_rates(id);
  END IF;
END $$;

-- Add tax_type column to association_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_transactions' AND column_name = 'tax_type'
  ) THEN
    ALTER TABLE association_transactions
    ADD COLUMN tax_type text DEFAULT 'none';
  END IF;
END $$;

-- Add constraint to ensure tax_type is valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'association_transactions' AND constraint_name = 'association_transactions_tax_type_check'
  ) THEN
    ALTER TABLE association_transactions
    ADD CONSTRAINT association_transactions_tax_type_check
    CHECK (tax_type IN ('none', 'included', 'excluded'));
  END IF;
END $$;
