/*
  # Create association invoices system

  1. New Tables
    - `association_invoices`
      - `id` (uuid, primary key)
      - `association_id` (uuid, NOT NULL)
      - `association_type` (text, 'state' or 'national')
      - `invoice_number` (text, unique per association)
      - `customer_name` (text)
      - `customer_email` (text)
      - `date` (date)
      - `due_date` (date)
      - `reference` (text)
      - `subtotal` (numeric)
      - `tax_amount` (numeric)
      - `total_amount` (numeric)
      - `status` (text - draft, sent, paid, overdue)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `association_invoice_line_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, foreign key to association_invoices)
      - `description` (text)
      - `unit_price` (numeric)
      - `quantity` (integer)
      - `category` (text)
      - `tax_type` (text - included, excluded, none)
      - `line_total` (numeric)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for association admins to manage invoices
*/

-- Create association invoices table
CREATE TABLE IF NOT EXISTS association_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  date date NOT NULL,
  due_date date,
  reference text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(association_id, association_type, invoice_number)
);

-- Create association invoice line items table
CREATE TABLE IF NOT EXISTS association_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES association_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  category text,
  tax_type text NOT NULL DEFAULT 'included' CHECK (tax_type IN ('included', 'excluded', 'none')),
  line_total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE association_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE association_invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user is association admin
CREATE OR REPLACE FUNCTION is_association_admin(assoc_id uuid, assoc_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF assoc_type = 'state' THEN
    RETURN EXISTS (
      SELECT 1 FROM state_association_admins
      WHERE association_id = assoc_id
      AND user_id = auth.uid()
    );
  ELSIF assoc_type = 'national' THEN
    RETURN EXISTS (
      SELECT 1 FROM national_association_admins
      WHERE association_id = assoc_id
      AND user_id = auth.uid()
    );
  END IF;
  RETURN false;
END;
$$;

-- Create policies for association_invoices
CREATE POLICY "Association admins can view invoices"
  ON association_invoices
  FOR SELECT
  TO authenticated
  USING (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can insert invoices"
  ON association_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can update invoices"
  ON association_invoices
  FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can delete invoices"
  ON association_invoices
  FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Create policies for association_invoice_line_items
CREATE POLICY "Association admins can view invoice line items"
  ON association_invoice_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices ai
      WHERE ai.id = association_invoice_line_items.invoice_id 
      AND is_association_admin(ai.association_id, ai.association_type)
    )
  );

CREATE POLICY "Association admins can insert invoice line items"
  ON association_invoice_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_invoices ai
      WHERE ai.id = association_invoice_line_items.invoice_id 
      AND is_association_admin(ai.association_id, ai.association_type)
    )
  );

CREATE POLICY "Association admins can update invoice line items"
  ON association_invoice_line_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices ai
      WHERE ai.id = association_invoice_line_items.invoice_id 
      AND is_association_admin(ai.association_id, ai.association_type)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_invoices ai
      WHERE ai.id = association_invoice_line_items.invoice_id 
      AND is_association_admin(ai.association_id, ai.association_type)
    )
  );

CREATE POLICY "Association admins can delete invoice line items"
  ON association_invoice_line_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices ai
      WHERE ai.id = association_invoice_line_items.invoice_id 
      AND is_association_admin(ai.association_id, ai.association_type)
    )
  );

-- Create updated_at trigger for association_invoices
CREATE TRIGGER update_association_invoices_updated_at
  BEFORE UPDATE ON association_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_association_invoices_association ON association_invoices(association_id, association_type);
CREATE INDEX IF NOT EXISTS idx_association_invoices_status ON association_invoices(status);
CREATE INDEX IF NOT EXISTS idx_association_invoices_date ON association_invoices(date);
CREATE INDEX IF NOT EXISTS idx_association_invoice_line_items_invoice ON association_invoice_line_items(invoice_id);