/*
  # Create Membership Transactions Linking Table
  
  1. New Table: `membership_transactions`
    - Links members to finance transactions
    - Tracks membership payment details
    - Enables payment history and audit trail
  
  2. Columns
    - `id` (uuid, primary key)
    - `club_id` (uuid, references clubs)
    - `member_id` (uuid, references members)
    - `transaction_id` (uuid, references transactions)
    - `membership_type_id` (uuid, references membership_types)
    - `amount` (decimal) - Base amount before tax
    - `tax_amount` (decimal) - Tax amount
    - `total_amount` (decimal) - Total including tax
    - `payment_method` (text) - bank_transfer, credit_card, cash
    - `payment_status` (text) - pending, paid, failed, refunded
    - `stripe_payment_intent_id` (text) - Stripe payment ID
    - `stripe_fee` (decimal) - Stripe processing fee
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
  
  3. Security
    - Enable RLS
    - Club admins and members can view their own records
    - Only club admins can create/modify
*/

CREATE TABLE IF NOT EXISTS membership_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  membership_type_id uuid,
  amount decimal NOT NULL,
  tax_amount decimal DEFAULT 0,
  total_amount decimal NOT NULL,
  payment_method text CHECK (payment_method IN ('bank_transfer', 'credit_card', 'cash')),
  payment_status text CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
  stripe_payment_intent_id text,
  stripe_fee decimal,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE membership_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Club admins can view all membership transactions for their club
CREATE POLICY "Club admins can view membership transactions"
  ON membership_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = membership_transactions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy: Members can view their own membership transactions
CREATE POLICY "Members can view own membership transactions"
  ON membership_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.id = membership_transactions.member_id
      AND members.user_id = auth.uid()
    )
  );

-- Policy: Club admins can create membership transactions
CREATE POLICY "Club admins can create membership transactions"
  ON membership_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = membership_transactions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Policy: Club admins can update membership transactions
CREATE POLICY "Club admins can update membership transactions"
  ON membership_transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = membership_transactions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = membership_transactions.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_membership_transactions_club_id ON membership_transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_membership_transactions_member_id ON membership_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_membership_transactions_transaction_id ON membership_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_membership_transactions_payment_status ON membership_transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_membership_transactions_created_at ON membership_transactions(created_at);
