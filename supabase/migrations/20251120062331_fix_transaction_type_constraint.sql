/*
  # Fix Transaction Type Constraint
  
  1. Changes
    - Update transactions type check constraint to accept 'income', 'deposit', and 'expense'
    - This aligns with how budget categories use 'income' type
    - Allows both 'income' and 'deposit' to be used interchangeably for deposits
*/

-- Drop the old constraint
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add new constraint that accepts income, deposit, and expense
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('income', 'deposit', 'expense'));
