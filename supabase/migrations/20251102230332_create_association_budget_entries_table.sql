/*
  # Create Association Budget Entries Table

  1. New Tables
    - `association_budget_entries`
      - `id` (uuid, primary key)
      - `association_id` (uuid, not null)
      - `association_type` (text, not null) - 'state' or 'national'
      - `category_id` (uuid, not null) - references association_budget_categories
      - `year` (integer, not null)
      - `month` (integer, not null) - 1-12
      - `budgeted_amount` (numeric, not null)
      - `actual_amount` (numeric)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `association_budget_entries` table
    - Add policies for association admins to manage budget entries
*/

CREATE TABLE IF NOT EXISTS association_budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL,
  association_type text NOT NULL CHECK (association_type IN ('state', 'national')),
  category_id uuid NOT NULL REFERENCES association_budget_categories(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  budgeted_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_association_budget_entries_association 
  ON association_budget_entries(association_id, association_type);

CREATE INDEX IF NOT EXISTS idx_association_budget_entries_category 
  ON association_budget_entries(category_id);

CREATE INDEX IF NOT EXISTS idx_association_budget_entries_year_month 
  ON association_budget_entries(year, month);

-- Enable RLS
ALTER TABLE association_budget_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view association budget entries if they have access"
  ON association_budget_entries FOR SELECT
  TO authenticated
  USING (user_has_association_access(association_id, association_type));

CREATE POLICY "Admins can insert association budget entries"
  ON association_budget_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association budget entries"
  ON association_budget_entries FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association budget entries"
  ON association_budget_entries FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));
