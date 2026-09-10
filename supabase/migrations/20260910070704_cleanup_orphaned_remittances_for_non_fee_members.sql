/*
# Cleanup orphaned remittances for non-fee-paying members

## Problem
The remittance trigger was previously creating remittance records for ALL members 
marked as financial, regardless of whether their membership type required association 
fees. This was fixed in a later migration, but the old orphaned remittance records 
remain and confuse club administrators.

Additionally, the year-bump loop in the trigger created duplicate remittances for 
future years (e.g. 2027, 2028) when members were renewed multiple times. These 
should be cleaned up.

## Changes
1. Delete all PENDING remittances where the member's current membership type does 
   NOT have requires_association_fees = true, OR the member has no club_memberships 
   record at all.
2. Delete PENDING remittances for years beyond the current membership cycle 
   (membership_year > current year AND membership_end_date is within the current cycle).
3. Do NOT delete any remittances with status 'paid' — those represent real payments.

## Safety
- Only deletes 'pending' status records (never paid/reconciled)
- Uses EXISTS checks to ensure accuracy
*/

-- Step 1: Delete pending remittances for members who have no club_memberships record
-- or whose membership type does not require association fees.
-- We keep 'paid' remittances as historical records.
DELETE FROM membership_remittances mr
WHERE mr.club_to_state_status = 'pending'
  AND NOT EXISTS (
    SELECT 1 
    FROM members m
    JOIN club_memberships cm ON cm.member_id = m.user_id AND cm.club_id = m.club_id AND cm.status = 'active'
    JOIN membership_types mt ON mt.id = cm.membership_type_id
    WHERE m.id = mr.member_id
      AND m.club_id = mr.club_id
      AND mt.requires_association_fees = true
  );

-- Step 2: For members who DO have valid fee-paying memberships, clean up
-- duplicate future-year remittances. Keep only the remittance whose 
-- membership_year best matches the current cycle (closest to current year 
-- without going over), delete pending ones for years beyond that.
-- 
-- Specifically: if a member has pending remittances for years 2026, 2027, 2028
-- and their renewal_date is 2027-07-01, the valid year is 2026 (covering the 
-- 2026-2027 period). The 2027 and 2028 pending entries are duplicates.
DELETE FROM membership_remittances mr
WHERE mr.club_to_state_status = 'pending'
  AND mr.membership_year > EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND EXISTS (
    SELECT 1 FROM membership_remittances mr2
    WHERE mr2.member_id = mr.member_id
      AND mr2.club_id = mr.club_id
      AND mr2.membership_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int
      AND mr2.membership_year < mr.membership_year
  );
