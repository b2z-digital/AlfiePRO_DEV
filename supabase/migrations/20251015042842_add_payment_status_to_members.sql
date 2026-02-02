/*
  # Add payment status tracking to members table
  
  1. Changes
    - Add `payment_status` column to members table
      - Values: 'paid', 'pending', 'overdue', null (for legacy records)
    - Add `payment_confirmed_at` timestamp column
    - Add `payment_method` column to track how they paid
  
  2. Notes
    - This allows tracking pending bank transfers separately from confirmed payments
    - Members with payment_status='pending' need reconciliation
    - Existing members default to null (no change to existing behavior)
*/

DO $$ 
BEGIN
  -- Add payment_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE members 
    ADD COLUMN payment_status text CHECK (payment_status IN ('paid', 'pending', 'overdue'));
  END IF;

  -- Add payment_confirmed_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'payment_confirmed_at'
  ) THEN
    ALTER TABLE members 
    ADD COLUMN payment_confirmed_at timestamptz;
  END IF;

  -- Add payment_method column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE members 
    ADD COLUMN payment_method text;
  END IF;
END $$;

-- Set existing financial members to 'paid' status
UPDATE members 
SET payment_status = 'paid',
    payment_confirmed_at = updated_at
WHERE is_financial = true AND payment_status IS NULL;

-- Set existing non-financial members to 'overdue' status
UPDATE members 
SET payment_status = 'overdue'
WHERE is_financial = false AND payment_status IS NULL;
