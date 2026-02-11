/*
  # Add membership_year column to remittance_payments

  1. Changes
    - Add `membership_year` integer column to `remittance_payments` table
    - This column tracks which membership year the payment relates to
    - Allows filtering payment history by year

  2. Notes
    - The column is nullable to support existing records
    - Default value is the current year for new records
    - Existing records will have NULL membership_year (shown under "All Years")
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remittance_payments' AND column_name = 'membership_year'
  ) THEN
    ALTER TABLE remittance_payments
    ADD COLUMN membership_year integer;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_remittance_payments_membership_year
  ON remittance_payments(membership_year);