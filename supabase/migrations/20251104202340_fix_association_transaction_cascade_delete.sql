/*
  # Fix Association Transaction Deletion with CASCADE

  This migration updates foreign key constraints on remittance_payment_batches
  to allow CASCADE deletion of association_transactions.

  1. Changes
    - Drops existing foreign key constraints
    - Recreates them with ON DELETE CASCADE
    - This allows deleting transactions that are referenced by batches

  2. Security
    - No RLS changes needed
    - Maintains referential integrity while allowing proper cleanup
*/

-- Drop existing foreign key constraints
ALTER TABLE public.remittance_payment_batches
DROP CONSTRAINT IF EXISTS remittance_payment_batches_state_transaction_id_fkey;

ALTER TABLE public.remittance_payment_batches
DROP CONSTRAINT IF EXISTS remittance_payment_batches_national_transaction_id_fkey;

-- Recreate with CASCADE delete
ALTER TABLE public.remittance_payment_batches
ADD CONSTRAINT remittance_payment_batches_state_transaction_id_fkey
FOREIGN KEY (state_transaction_id)
REFERENCES public.association_transactions(id)
ON DELETE CASCADE;

ALTER TABLE public.remittance_payment_batches
ADD CONSTRAINT remittance_payment_batches_national_transaction_id_fkey
FOREIGN KEY (national_transaction_id)
REFERENCES public.association_transactions(id)
ON DELETE CASCADE;