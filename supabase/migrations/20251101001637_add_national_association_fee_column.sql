/*
  # Add National Association Fee Column

  1. Changes
    - Add `national_fee_per_member` column to national_associations table
    - This represents the amount national associations charge state associations per member
    - Set default value of $5.00
    
  2. Notes
    - This was missed in the previous migration
    - National associations charge state associations, who in turn charge clubs
*/

-- Add fee configuration to national associations (amount they charge state associations)
ALTER TABLE national_associations 
ADD COLUMN IF NOT EXISTS national_fee_per_member numeric DEFAULT 5.00;

COMMENT ON COLUMN national_associations.national_fee_per_member IS 'Amount in dollars that state associations pay to the national association per member';

-- Update existing national associations to have the default value
UPDATE national_associations 
SET national_fee_per_member = 5.00 
WHERE national_fee_per_member IS NULL;
