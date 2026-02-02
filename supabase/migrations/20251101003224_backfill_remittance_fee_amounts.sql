/*
  # Backfill Remittance Fee Amounts

  1. Purpose
    - Update existing membership_remittances records with correct fee amounts
    - Calculate state and national contribution amounts based on current fee structure
    - Update total membership fees and club retained amounts

  2. Logic
    - For each remittance, look up the club's state_fee_per_member
    - Look up the state association's national_fee_per_member
    - Calculate: state_contribution_amount = state_fee_per_member
    - Calculate: national_contribution_amount = national_fee_per_member
    - Calculate: total_membership_fee = state_fee + national_fee
    - Calculate: club_retained_amount = 0 (clubs pass through all fees)

  3. Notes
    - Only updates remittances where amounts are currently 0
    - Preserves any manually set amounts
*/

-- Update remittances with fee amounts based on club and association structure
UPDATE membership_remittances mr
SET 
  state_contribution_amount = COALESCE(c.state_fee_per_member, 15.00),
  national_contribution_amount = COALESCE(sa.national_fee_per_member, 5.00),
  total_membership_fee = COALESCE(c.state_fee_per_member, 15.00) + COALESCE(sa.national_fee_per_member, 5.00),
  club_retained_amount = 0,
  updated_at = NOW()
FROM clubs c
LEFT JOIN state_associations sa ON c.state_association_id = sa.id
WHERE 
  mr.club_id = c.id
  AND mr.state_contribution_amount = 0
  AND mr.national_contribution_amount = 0;

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % remittance records with correct fee amounts', updated_count;
END $$;
