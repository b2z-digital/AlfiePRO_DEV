/*
  # Add Finance Integration Configuration to Clubs
  
  1. Changes to `clubs` table
    - Add `tax_enabled` (boolean) - Whether tax is applied to transactions
    - Add `tax_rate` (decimal) - Tax rate as decimal (e.g., 0.10 for 10%)
    - Add `tax_name` (text) - Display name for tax (e.g., "GST", "VAT")
    - Add `tax_registration_number` (text) - Business tax registration number
    - Add `default_membership_category_id` (uuid) - Default category for membership income
    - Add `stripe_enabled` (boolean) - Whether Stripe payments are active
  
  2. Purpose
    - Enable automatic tax calculation on membership payments
    - Link membership payments to finance categories
    - Track Stripe payment gateway status
  
  3. Notes
    - All fields are optional (NULL allowed) for backward compatibility
    - Existing clubs will have defaults applied
    - References budget_categories table for finance category
*/

-- Add tax configuration fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'tax_enabled'
  ) THEN
    ALTER TABLE clubs ADD COLUMN tax_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'tax_rate'
  ) THEN
    ALTER TABLE clubs ADD COLUMN tax_rate decimal(5,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'tax_name'
  ) THEN
    ALTER TABLE clubs ADD COLUMN tax_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'tax_registration_number'
  ) THEN
    ALTER TABLE clubs ADD COLUMN tax_registration_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'default_membership_category_id'
  ) THEN
    ALTER TABLE clubs ADD COLUMN default_membership_category_id uuid REFERENCES budget_categories(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'stripe_enabled'
  ) THEN
    ALTER TABLE clubs ADD COLUMN stripe_enabled boolean DEFAULT false;
  END IF;
END $$;

-- Update existing clubs with stripe_account_id to have stripe_enabled = true
UPDATE clubs 
SET stripe_enabled = true 
WHERE stripe_account_id IS NOT NULL AND stripe_enabled IS NULL;
