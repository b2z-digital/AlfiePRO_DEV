/*
  # Fix duplicate remittance triggers and clean up erroneous transactions

  1. Problem
    - Two triggers fire on membership_remittances status change to 'paid':
      a) `sync_remittance_status_to_club_trigger` (older) -> creates "State Association Fee" expense
      b) `trigger_club_remittance_payment` (newer) -> creates "Membership Remittance" expense
    - Both triggers create individual expense transactions per member
    - When "Mark Previously Paid" is used, `bulk_payment` was set to `false`,
      so neither trigger skipped, creating double expenses for every member
    - This put club finances into deficit despite no real payment occurring

  2. Fix
    - Drop the older `sync_remittance_status_to_club_trigger` (superseded by newer trigger)
    - Delete all erroneous individual transactions created by both triggers
      for remittances that were externally/previously paid (bulk_payment = false, status = paid)
    - Delete corresponding erroneous association income transactions
    - Update affected remittances to set bulk_payment = true so the remaining
      trigger correctly skips them going forward

  3. Tables Affected
    - transactions: erroneous expense records deleted
    - association_transactions: erroneous income records deleted
    - membership_remittances: bulk_payment flag corrected

  4. Security
    - No RLS changes
*/

-- Step 1: Drop the older duplicate trigger
DROP TRIGGER IF EXISTS sync_remittance_status_to_club_trigger ON membership_remittances;

-- Step 2: Delete erroneous club expense transactions created by the old trigger
-- These have system_key = 'association_fees' and are linked to remittances
DELETE FROM transactions
WHERE linked_entity_type = 'remittance'
  AND linked_entity_id IS NOT NULL
  AND category_id IN (
    SELECT id FROM budget_categories WHERE system_key = 'association_fees'
  )
  AND linked_entity_id IN (
    SELECT id FROM membership_remittances
    WHERE club_to_state_status = 'paid'
    AND bulk_payment = false
  );

-- Step 3: Delete erroneous club expense transactions created by the newer trigger
-- These have system_key = 'membership_remittances' and are linked to remittances
DELETE FROM transactions
WHERE linked_entity_type = 'remittance'
  AND linked_entity_id IS NOT NULL
  AND category_id IN (
    SELECT id FROM budget_categories WHERE system_key = 'membership_remittances'
  )
  AND linked_entity_id IN (
    SELECT id FROM membership_remittances
    WHERE club_to_state_status = 'paid'
    AND bulk_payment = false
  );

-- Step 4: Delete erroneous association income transactions created by the newer trigger
DELETE FROM association_transactions
WHERE linked_entity_type = 'remittance'
  AND linked_entity_id IS NOT NULL
  AND linked_entity_id IN (
    SELECT id FROM membership_remittances
    WHERE club_to_state_status = 'paid'
    AND bulk_payment = false
  );

-- Step 5: Fix the bulk_payment flag on all externally paid remittances
-- so the remaining trigger correctly skips them
UPDATE membership_remittances
SET bulk_payment = true, updated_at = now()
WHERE club_to_state_status = 'paid'
  AND bulk_payment = false;
