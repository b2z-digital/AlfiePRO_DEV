/*
  # Create invoices and invoice line items tables

  1. New Tables
    - `invoices`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `invoice_number` (text, unique per club)
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
    
    - `invoice_line_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, foreign key to invoices)
      - `description` (text)
      - `unit_price` (numeric)
      - `quantity` (integer)
      - `category` (text)
      - `tax_type` (text - included, excluded, none)
      - `line_total` (numeric)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for club members to manage their club's invoices
*/

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  date date NOT NULL,
  due_date date,
  reference text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, invoice_number)
);

-- Add check constraint for status
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text]));

-- Create invoice line items table
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  category text,
  tax_type text NOT NULL DEFAULT 'included',
  line_total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add check constraint for tax_type
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_tax_type_check 
  CHECK (tax_type = ANY (ARRAY['included'::text, 'excluded'::text, 'none'::text]));

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Create policies for invoices
CREATE POLICY "Club members can view invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = invoices.club_id 
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can manage invoices"
  ON invoices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = invoices.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = invoices.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'::club_role
    )
  );

-- Create policies for invoice line items
CREATE POLICY "Club members can view invoice line items"
  ON invoice_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON uc.club_id = i.club_id
      WHERE i.id = invoice_line_items.invoice_id 
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins can manage invoice line items"
  ON invoice_line_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON uc.club_id = i.club_id
      WHERE i.id = invoice_line_items.invoice_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_clubs uc ON uc.club_id = i.club_id
      WHERE i.id = invoice_line_items.invoice_id 
      AND uc.user_id = auth.uid() 
      AND uc.role = 'admin'::club_role
    )
  );

-- Create updated_at trigger for invoices
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();