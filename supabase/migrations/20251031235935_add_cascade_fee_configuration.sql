/*
  # Add Cascade Fee Configuration

  1. Changes
    - Add `national_fee_per_member` column to state_associations table (amount state pays to national per member)
    - Add `state_fee_per_member` column to clubs table (amount club pays to state per member)
    - Set default values of $5 for national and $15 for state (as requested)
    
  2. Notes
    - These amounts can be configured per state association and per club
    - Default values can be overridden in settings
*/

-- Add fee configuration to state associations (amount they pay to national)
ALTER TABLE state_associations 
ADD COLUMN IF NOT EXISTS national_fee_per_member numeric DEFAULT 5.00;

COMMENT ON COLUMN state_associations.national_fee_per_member IS 'Amount in dollars that the state association pays to the national association per member';

-- Add fee configuration to clubs (amount they pay to state)
ALTER TABLE clubs 
ADD COLUMN IF NOT EXISTS state_fee_per_member numeric DEFAULT 15.00;

COMMENT ON COLUMN clubs.state_fee_per_member IS 'Amount in dollars that the club pays to the state association per member';

-- Update existing state associations to have the default value
UPDATE state_associations 
SET national_fee_per_member = 5.00 
WHERE national_fee_per_member IS NULL;

-- Update existing clubs to have the default value
UPDATE clubs 
SET state_fee_per_member = 15.00 
WHERE state_fee_per_member IS NULL;
