/*
  # Add currency field to tax_rates table

  1. Changes
    - Add currency column to tax_rates table with default value 'AUD'
    - Update existing records to have 'AUD' as currency
    - Add check constraint to ensure currency is not empty

  2. Security
    - No changes to RLS policies needed
*/

-- Add currency column to tax_rates table
ALTER TABLE tax_rates 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'AUD' NOT NULL;

-- Update existing records to have AUD as default currency
UPDATE tax_rates 
SET currency = 'AUD' 
WHERE currency IS NULL OR currency = '';

-- Add check constraint to ensure currency is not empty
ALTER TABLE tax_rates 
ADD CONSTRAINT tax_rates_currency_check 
CHECK (currency IS NOT NULL AND currency != '');