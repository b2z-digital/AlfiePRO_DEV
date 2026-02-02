/*
  # Add currency field to tax rates

  1. Changes
    - Add `currency` column to `tax_rates` table with default 'AUD'
    - Update existing records to have 'AUD' as default currency

  2. Security
    - No changes to RLS policies needed
*/

-- Add currency column to tax_rates table
ALTER TABLE tax_rates ADD COLUMN currency text DEFAULT 'AUD' NOT NULL;

-- Update existing records to have AUD as default
UPDATE tax_rates SET currency = 'AUD' WHERE currency IS NULL;