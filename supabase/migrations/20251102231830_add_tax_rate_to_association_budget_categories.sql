/*
  # Add Tax Rate to Association Budget Categories

  1. Changes
    - Add `tax_rate_id` column to `association_budget_categories` table
    - This allows categories to have a default tax rate assigned
    - Nullable to allow categories without tax

  2. Notes
    - Matches the structure of `budget_categories` table used by clubs
    - Enables automatic tax calculation on invoices for associations
*/

-- Add tax_rate_id column to association_budget_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'association_budget_categories' AND column_name = 'tax_rate_id'
  ) THEN
    ALTER TABLE association_budget_categories ADD COLUMN tax_rate_id uuid REFERENCES association_tax_rates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_association_budget_categories_tax_rate 
  ON association_budget_categories(tax_rate_id);
