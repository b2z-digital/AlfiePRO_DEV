/*
  # Fix Existing 2026 Remittances

  Updates remittance records that were incorrectly assigned to 2026 when they should be 2025.
  
  This fixes members who:
  - Joined in early 2026 (Jan-Jun)
  - Have a renewal date in 2026 (typically July 2026)
  - Should be paying for the 2025-2026 membership year, not 2026-2027
  
  ## Changes
  - Update membership_year from 2026 to 2025 for affected records
  - Only affects records where renewal_date > membership_start_date + 6 months
*/

-- Update remittances that were incorrectly assigned to 2026
UPDATE membership_remittances
SET membership_year = 2025
WHERE membership_year = 2026
  AND membership_start_date < '2026-07-01'
  AND membership_end_date IS NOT NULL
  AND membership_end_date > membership_start_date + INTERVAL '6 months';

-- Log the changes
DO $$
DECLARE
  v_updated_count integer;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % remittance records from 2026 to 2025', v_updated_count;
END $$;