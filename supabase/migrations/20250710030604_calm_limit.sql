/*
  # Add Invoice Payments and Notes Support

  1. New Features
    - Add `invoice_id` column to `transactions` table to link payments to invoices
    - Create `invoice_notes` table for storing notes on invoices
    
  2. Security
    - Enable RLS on `invoice_notes` table
    - Add policies for club members to manage invoice notes
    - Add trigger for updated_at timestamp
*/

-- Add invoice_id column to transactions table to link payments to invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create invoice_notes table
CREATE TABLE IF NOT EXISTS invoice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id)
);

-- Enable RLS on invoice_notes
ALTER TABLE invoice_notes ENABLE ROW LEVEL SECURITY;

-- Policies for invoice_notes
CREATE POLICY "Users can view notes for invoices in their clubs"
  ON invoice_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON i.club_id = uc.club_id
      WHERE i.id = invoice_notes.invoice_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add notes to invoices in their clubs"
  ON invoice_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON i.club_id = uc.club_id
      WHERE i.id = invoice_notes.invoice_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can update notes for invoices in their clubs"
  ON invoice_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON i.club_id = uc.club_id
      WHERE i.id = invoice_notes.invoice_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

CREATE POLICY "Club admins can delete notes for invoices in their clubs"
  ON invoice_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON i.club_id = uc.club_id
      WHERE i.id = invoice_notes.invoice_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
  );

-- Add trigger to update updated_at column for invoice_notes
CREATE TRIGGER update_invoice_notes_updated_at
  BEFORE UPDATE ON invoice_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();