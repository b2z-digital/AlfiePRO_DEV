/*
  # Fix externally paid remittances bulk_payment flag

  1. Data Fix
    - Updates `bulk_payment` to `false` for remittances that were marked as
      "Already Paid Externally" during member import
    - These records have `club_to_state_status = 'paid'` and `bulk_payment = true`
      but no corresponding finance transaction was created
    - Setting `bulk_payment = false` correctly marks them as fully reconciled,
      so they no longer appear in the state association's "Members Requiring Payment" list

  2. Why This Fix Is Needed
    - The `bulk_payment = true` flag was intended to signal "club paid, awaiting state reconciliation"
    - However, "Already Paid Externally" means the state already received payment outside the system
    - These members should NOT require state reconciliation
    - The club summary card correctly shows them as "Paid" but the detail view
      was incorrectly including them as "requiring payment"

  3. Scope
    - Only affects remittances where `club_to_state_status = 'paid'` AND `bulk_payment = true`
      AND no matching finance transaction exists (i.e., they were externally paid)
*/

UPDATE membership_remittances
SET bulk_payment = false, updated_at = now()
WHERE club_to_state_status = 'paid'
  AND bulk_payment = true
  AND NOT EXISTS (
    SELECT 1 FROM association_transactions t
    JOIN association_budget_categories c ON t.category_id = c.id
    WHERE c.system_key = 'club_remittances'
      AND t.type = 'income'
      AND t.reference = membership_remittances.club_to_state_payment_reference
  );