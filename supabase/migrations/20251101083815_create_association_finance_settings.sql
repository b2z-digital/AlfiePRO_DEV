/*
  # Create association finance settings

  1. New Tables
    - `association_finance_settings`
      - `id` (uuid, primary key)
      - `association_id` (uuid, NOT NULL)
      - `association_type` (text, 'state' or 'national')
      - `invoice_prefix` (text, default 'INV-')
      - `invoice_next_number` (integer, default 1)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for association admins
*/

-- Create association_finance_settings table
CREATE TABLE IF NOT EXISTS association_finance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  invoice_prefix text DEFAULT 'INV-',
  invoice_next_number integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(association_id, association_type)
);

-- Enable RLS
ALTER TABLE association_finance_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Association admins can view finance settings"
  ON association_finance_settings
  FOR SELECT
  TO authenticated
  USING (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can insert finance settings"
  ON association_finance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can update finance settings"
  ON association_finance_settings
  FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can delete finance settings"
  ON association_finance_settings
  FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Create updated_at trigger
CREATE TRIGGER update_association_finance_settings_updated_at
  BEFORE UPDATE ON association_finance_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_association_finance_settings_association 
  ON association_finance_settings(association_id, association_type);