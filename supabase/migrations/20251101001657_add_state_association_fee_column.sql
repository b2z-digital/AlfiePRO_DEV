/*
  # Add State Association Fee Column

  1. Changes
    - Add `state_fee_per_member` column to state_associations table
    - This represents the amount state associations charge clubs per member
    - Set default value of $15.00
    
  2. Notes
    - State associations charge clubs
    - Then state associations pay national associations
    - This column tracks what state associations charge TO clubs
*/

-- Add fee configuration to state associations (amount they charge clubs)
ALTER TABLE state_associations 
ADD COLUMN IF NOT EXISTS state_fee_per_member numeric DEFAULT 15.00;

COMMENT ON COLUMN state_associations.state_fee_per_member IS 'Amount in dollars that clubs pay to the state association per member';

-- Update existing state associations to have the default value
UPDATE state_associations 
SET state_fee_per_member = 15.00 
WHERE state_fee_per_member IS NULL;
