/*
  # Fix association_transactions linked_entity_type constraint

  1. Changes
    - Update the check constraint on `association_transactions.linked_entity_type` to also allow 'invoice' as a valid value
    - This fixes the error when marking association invoices as paid, which triggers automatic transaction creation with linked_entity_type = 'invoice'

  2. Affected Tables
    - `association_transactions` - constraint update only, no data changes
*/

ALTER TABLE association_transactions
  DROP CONSTRAINT IF EXISTS association_transactions_linked_entity_type_check;

ALTER TABLE association_transactions
  ADD CONSTRAINT association_transactions_linked_entity_type_check
  CHECK (linked_entity_type = ANY (ARRAY['remittance'::text, 'club'::text, 'state'::text, 'operational'::text, 'invoice'::text]));
