/*
  # Create transactions and transaction line items tables

  1. New Tables
    - `transactions`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `type` (text, 'deposit' or 'expense')
      - `description` (text)
      - `amount` (numeric)
      - `date` (date)
      - `category_id` (uuid, foreign key to budget_categories)
      - `payer` (text, optional)
      - `payee` (text, optional)
      - `reference` (text, optional)
      - `notes` (text, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `transaction_line_items`
      - `id` (uuid, primary key)
      - `transaction_id` (uuid, foreign key to transactions)
      - `description` (text)
      - `amount` (numeric)
      - `category_id` (uuid, foreign key to budget_categories)
      - `tax_type` (text, 'none', 'included', or 'excluded')
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for club admins to manage and members to view
    - Add indexes for performance
    - Add triggers for updated_at timestamps
*/

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'expense')),
  description text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  date date NOT NULL,
  category_id uuid REFERENCES budget_categories(id),
  payer text,
  payee text,
  reference text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transaction line items table
CREATE TABLE IF NOT EXISTS transaction_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  category_id uuid REFERENCES budget_categories(id),
  tax_type text NOT NULL DEFAULT 'none' CHECK (tax_type IN ('none', 'included', 'excluded')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_line_items ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_club_id ON transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transaction_line_items_transaction_id ON transaction_line_items(transaction_id);

-- Add triggers for updated_at
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for transactions
CREATE POLICY "Club admins can manage transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = transactions.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = transactions.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Club members can view transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = transactions.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- RLS Policies for transaction line items
CREATE POLICY "Club admins can manage transaction line items"
  ON transaction_line_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN user_clubs uc ON uc.club_id = t.club_id
      WHERE t.id = transaction_line_items.transaction_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN user_clubs uc ON uc.club_id = t.club_id
      WHERE t.id = transaction_line_items.transaction_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Club members can view transaction line items"
  ON transaction_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN user_clubs uc ON uc.club_id = t.club_id
      WHERE t.id = transaction_line_items.transaction_id
      AND uc.user_id = auth.uid()
    )
  );