/*
  # Fix Association Tax Rates Foreign Key Constraints

  1. Changes
    - Drop the invalid dual foreign key constraints
    - The association_id can reference either state or national associations
    - We validate via check constraints and RLS instead of foreign keys
    
  2. Security
    - Existing RLS policies ensure data integrity
*/

-- Drop the problematic foreign key constraints
ALTER TABLE association_tax_rates 
  DROP CONSTRAINT IF EXISTS fk_state_association;

ALTER TABLE association_tax_rates 
  DROP CONSTRAINT IF EXISTS fk_national_association;

-- Note: We rely on RLS policies to ensure association_id validity
-- The is_association_admin() function already validates the association exists
