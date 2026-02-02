/*
  # Add Opening Balance to Association Finance Settings

  1. Changes
    - Adds opening_balance column to association_finance_settings table
    - Defaults to 0 for existing records

  2. Security
    - No RLS changes needed, existing policies apply
*/

-- Add opening_balance column to association_finance_settings
ALTER TABLE association_finance_settings
ADD COLUMN IF NOT EXISTS opening_balance numeric(10,2) NOT NULL DEFAULT 0;
