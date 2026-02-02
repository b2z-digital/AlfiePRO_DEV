/*
  # Add Payment Type and Transaction Reference to Transactions

  1. Changes
    - Add `payment_method` column to transactions table
    - Add `transaction_reference` column to transactions table
    - Update existing records to have default payment method

  2. Security
    - No changes to RLS policies needed
*/

-- Add payment_method column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE transactions ADD COLUMN payment_method text DEFAULT 'cash';
  END IF;
END $$;

-- Add transaction_reference column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'transaction_reference'
  ) THEN
    ALTER TABLE transactions ADD COLUMN transaction_reference text;
  END IF;
END $$;

-- Add check constraint for payment_method
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'transactions_payment_method_check'
  ) THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_payment_method_check 
    CHECK (payment_method IN ('cash', 'card', 'cheque', 'bank', 'other'));
  END IF;
END $$;