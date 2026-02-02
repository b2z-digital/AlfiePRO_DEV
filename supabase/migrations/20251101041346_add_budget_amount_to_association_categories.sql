/*
  # Add budget_amount column to association_budget_categories

  1. Changes
    - Add budget_amount column (numeric, default 0)
    - This allows associations to set budgets for their categories
  
  2. Security
    - No RLS changes needed (existing policies apply)
*/

-- Add budget_amount column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'association_budget_categories' 
    AND column_name = 'budget_amount'
  ) THEN
    ALTER TABLE association_budget_categories 
    ADD COLUMN budget_amount numeric DEFAULT 0 NOT NULL;
  END IF;
END $$;