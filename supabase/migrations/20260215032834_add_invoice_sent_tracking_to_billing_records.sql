/*
  # Add invoice sent tracking to platform billing records

  1. Modified Tables
    - `platform_billing_records`
      - `invoice_sent_at` (timestamptz, nullable) - When the invoice email was last sent
      - `invoice_sent_to` (text, nullable) - Email address the invoice was sent to

  2. Purpose
    - Track whether an invoice email has been sent for each billing record
    - Provide transparency so admins know which records have been invoiced by email
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_records' AND column_name = 'invoice_sent_at'
  ) THEN
    ALTER TABLE public.platform_billing_records ADD COLUMN invoice_sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_billing_records' AND column_name = 'invoice_sent_to'
  ) THEN
    ALTER TABLE public.platform_billing_records ADD COLUMN invoice_sent_to text;
  END IF;
END $$;
