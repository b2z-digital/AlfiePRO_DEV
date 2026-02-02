/*
  # Update expenses table for new fields

  1. Changes
    - Add due_date field for expense due dates
    - Add expense_number field for auto-generated expense IDs (Exp-001, etc.)
    - Add payment_status field to replace payment_method and transaction_reference
    - Remove payment_method and transaction_reference columns (if they exist)

  2. Security
    - Maintain existing RLS policies
*/

-- Add new columns to transactions table for expenses
DO $$
BEGIN
  -- Add due_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE transactions ADD COLUMN due_date date;
  END IF;

  -- Add expense_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'expense_number'
  ) THEN
    ALTER TABLE transactions ADD COLUMN expense_number text;
  END IF;

  -- Add payment_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE transactions ADD COLUMN payment_status text DEFAULT 'awaiting_payment';
  END IF;
END $$;

-- Add constraint for payment_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_payment_status_check'
  ) THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_payment_status_check 
    CHECK (payment_status IN ('paid', 'awaiting_payment'));
  END IF;
END $$;

-- Create function to generate expense numbers
CREATE OR REPLACE FUNCTION generate_expense_number(club_uuid uuid)
RETURNS text AS $$
DECLARE
  next_number integer;
  expense_number text;
BEGIN
  -- Get the next expense number for this club
  SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 'Exp-(\d+)') AS integer)), 0) + 1
  INTO next_number
  FROM transactions
  WHERE club_id = club_uuid AND expense_number IS NOT NULL;
  
  -- Format as Exp-001, Exp-002, etc.
  expense_number := 'Exp-' || LPAD(next_number::text, 3, '0');
  
  RETURN expense_number;
END;
$$ LANGUAGE plpgsql;