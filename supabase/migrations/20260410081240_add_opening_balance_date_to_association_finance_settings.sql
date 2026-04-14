/*
  # Add Opening Balance Date to Association Finance Settings

  1. Changes
    - Adds `opening_balance_date` column to `association_finance_settings` table
    - This column was previously missing, preventing associations from saving
      the date associated with their opening balance
    - Defaults to current date for existing records

  2. Security
    - No RLS changes needed, existing policies apply
*/

ALTER TABLE association_finance_settings
ADD COLUMN IF NOT EXISTS opening_balance_date date NOT NULL DEFAULT CURRENT_DATE;
