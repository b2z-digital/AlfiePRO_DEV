/*
  # Add Payment Gateway Tracking to Transactions
  
  1. Changes to `transactions` table
    - Add `payment_gateway` (text) - Payment processor used (stripe, manual, etc)
    - Add `gateway_transaction_id` (text) - External transaction ID
    - Add `gateway_fee` (decimal) - Processing fee charged by gateway
    - Add `net_amount` (decimal) - Amount after fees
    - Add `linked_entity_type` (text) - Type of linked record (membership, invoice, event)
    - Add `linked_entity_id` (uuid) - ID of linked record
    - Add `tax_amount` (decimal) - Tax included in transaction
  
  2. Purpose
    - Track payment gateway fees (especially Stripe)
    - Link transactions to source records (members, invoices)
    - Enable comprehensive financial reporting
    - Support tax calculations
  
  3. Notes
    - All fields are optional for backward compatibility
    - Existing transactions remain unaffected
*/

DO $$
BEGIN
  -- Add payment_gateway column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'payment_gateway'
  ) THEN
    ALTER TABLE transactions ADD COLUMN payment_gateway text;
  END IF;

  -- Add gateway_transaction_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'gateway_transaction_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN gateway_transaction_id text;
  END IF;

  -- Add gateway_fee column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'gateway_fee'
  ) THEN
    ALTER TABLE transactions ADD COLUMN gateway_fee decimal DEFAULT 0;
  END IF;

  -- Add net_amount column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'net_amount'
  ) THEN
    ALTER TABLE transactions ADD COLUMN net_amount decimal;
  END IF;

  -- Add linked_entity_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'linked_entity_type'
  ) THEN
    ALTER TABLE transactions ADD COLUMN linked_entity_type text;
  END IF;

  -- Add linked_entity_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'linked_entity_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN linked_entity_id uuid;
  END IF;

  -- Add tax_amount column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'tax_amount'
  ) THEN
    ALTER TABLE transactions ADD COLUMN tax_amount decimal DEFAULT 0;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_payment_gateway ON transactions(payment_gateway);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway_transaction_id ON transactions(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_linked_entity ON transactions(linked_entity_type, linked_entity_id);
