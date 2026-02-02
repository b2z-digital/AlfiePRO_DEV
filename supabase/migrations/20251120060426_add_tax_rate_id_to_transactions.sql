/*
  # Add tax_rate_id to transactions table

  1. Changes
    - Add `tax_rate_id` column to `transactions` table to link to tax rates
    - Column is nullable to support transactions without tax
    - Add foreign key constraint to `tax_rates` table

  2. Purpose
    - Enable tracking which tax rate was applied to each transaction
    - Support detailed tax reporting and reconciliation
*/

-- Add tax_rate_id column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'transactions'
    AND column_name = 'tax_rate_id'
  ) THEN
    ALTER TABLE public.transactions
    ADD COLUMN tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE SET NULL;
    
    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_transactions_tax_rate_id ON public.transactions(tax_rate_id);
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.transactions.tax_rate_id IS 'Reference to the tax rate applied to this transaction';