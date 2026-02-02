/*
  # Create Association Tax Rates Table

  1. New Tables
    - `association_tax_rates`
      - `id` (uuid, primary key)
      - `association_id` (uuid, not null)
      - `association_type` (text, not null) - 'state' or 'national'
      - `name` (text, not null) - Tax name (e.g., "GST", "VAT")
      - `rate` (numeric, not null) - Tax rate percentage
      - `is_default` (boolean) - Default tax rate
      - `is_active` (boolean) - Active status
      - `currency` (text) - Currency code
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `association_tax_rates` table
    - Add policies for association admins to manage tax rates
*/

CREATE TABLE IF NOT EXISTS association_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  currency text NOT NULL DEFAULT 'AUD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Foreign key constraints
  CONSTRAINT fk_state_association FOREIGN KEY (association_id) 
    REFERENCES state_associations(id) ON DELETE CASCADE,
  CONSTRAINT fk_national_association FOREIGN KEY (association_id) 
    REFERENCES national_associations(id) ON DELETE CASCADE
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_association_tax_rates_association 
  ON association_tax_rates(association_id, association_type);

-- Enable RLS
ALTER TABLE association_tax_rates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view association tax rates if they have access"
  ON association_tax_rates FOR SELECT
  TO authenticated
  USING (user_has_association_access(association_id, association_type));

CREATE POLICY "Admins can insert association tax rates"
  ON association_tax_rates FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association tax rates"
  ON association_tax_rates FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association tax rates"
  ON association_tax_rates FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));
