/*
  # Finance Settings Tables

  1. New Tables
    - `tax_rates`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `name` (text)
      - `rate` (decimal)
      - `is_default` (boolean)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `club_finance_settings`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `invoice_title` (text)
      - `organization_number` (text)
      - `number_prefix` (text)
      - `next_number_starts_from` (integer)
      - `footer_information` (text)
      - `payment_information` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Updates to existing tables
    - Add `tax_rate_id` to `budget_categories`
    - Add `default_tax_rate_id` to `budget_categories`

  3. Security
    - Enable RLS on all tables
    - Add policies for club admins to manage settings
*/

-- Create tax_rates table
CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  rate decimal(5,4) NOT NULL DEFAULT 0,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create club_finance_settings table
CREATE TABLE IF NOT EXISTS club_finance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL UNIQUE,
  invoice_title text DEFAULT 'INVOICE',
  organization_number text DEFAULT '',
  number_prefix text DEFAULT 'INV-',
  next_number_starts_from integer DEFAULT 1,
  footer_information text DEFAULT '',
  payment_information text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add tax_rate_id to budget_categories if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_categories' AND column_name = 'tax_rate_id'
  ) THEN
    ALTER TABLE budget_categories ADD COLUMN tax_rate_id uuid REFERENCES tax_rates(id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_finance_settings ENABLE ROW LEVEL SECURITY;

-- Tax rates policies
CREATE POLICY "Club admins can manage tax rates"
  ON tax_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = tax_rates.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = tax_rates.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Club members can view tax rates"
  ON tax_rates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = tax_rates.club_id
      AND uc.user_id = uid()
    )
  );

-- Finance settings policies
CREATE POLICY "Club admins can manage finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_finance_settings.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_finance_settings.club_id
      AND uc.user_id = uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Club members can view finance settings"
  ON club_finance_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_finance_settings.club_id
      AND uc.user_id = uid()
    )
  );

-- Create triggers for updated_at
CREATE TRIGGER update_tax_rates_updated_at
  BEFORE UPDATE ON tax_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_club_finance_settings_updated_at
  BEFORE UPDATE ON club_finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default tax rates for existing clubs
INSERT INTO tax_rates (club_id, name, rate, is_default, is_active)
SELECT 
  id as club_id,
  'GST' as name,
  0.10 as rate,
  true as is_default,
  true as is_active
FROM clubs
ON CONFLICT DO NOTHING;

INSERT INTO tax_rates (club_id, name, rate, is_default, is_active)
SELECT 
  id as club_id,
  'No Tax' as name,
  0.00 as rate,
  false as is_default,
  true as is_active
FROM clubs
ON CONFLICT DO NOTHING;

-- Insert default finance settings for existing clubs
INSERT INTO club_finance_settings (club_id)
SELECT id FROM clubs
ON CONFLICT (club_id) DO NOTHING;