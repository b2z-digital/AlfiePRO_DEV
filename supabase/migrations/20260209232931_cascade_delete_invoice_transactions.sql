/*
  # Cascade delete linked transactions when an invoice is deleted

  1. Changes
    - Create a trigger function that automatically deletes any transaction
      linked to an invoice when that invoice is deleted
    - This ensures financial records stay consistent when invoices are removed

  2. Affected Tables
    - `association_invoices` - trigger added on DELETE
    - `association_transactions` - linked rows cleaned up automatically
*/

CREATE OR REPLACE FUNCTION delete_invoice_linked_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM association_transactions
  WHERE linked_entity_type = 'invoice'
    AND linked_entity_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_delete_invoice_transactions ON association_invoices;

CREATE TRIGGER trigger_delete_invoice_transactions
  BEFORE DELETE ON association_invoices
  FOR EACH ROW
  EXECUTE FUNCTION delete_invoice_linked_transactions();
