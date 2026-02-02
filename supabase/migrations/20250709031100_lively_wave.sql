/*
  # Create budget entries table

  1. New Tables
    - `budget_entries`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `category_id` (uuid, foreign key to budget_categories)
      - `year` (integer)
      - `month` (integer, 1-12)
      - `budgeted_amount` (numeric)
      - `actual_amount` (numeric, calculated)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `budget_entries` table
    - Add policies for club admins to manage entries
    - Add policies for club members to view entries

  3. Functions
    - Add function to calculate actual amounts from transactions
    - Add trigger to update updated_at column
*/

CREATE TABLE IF NOT EXISTS budget_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  budgeted_amount numeric(10,2) NOT NULL DEFAULT 0,
  actual_amount numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, category_id, year, month)
);

ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;

-- Policies for budget entries
CREATE POLICY "Club admins can manage budget entries"
  ON budget_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = budget_entries.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = budget_entries.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'::club_role
    )
  );

CREATE POLICY "Club members can view budget entries"
  ON budget_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = budget_entries.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_budget_entries_updated_at
  BEFORE UPDATE ON budget_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate actual amounts from transactions
CREATE OR REPLACE FUNCTION calculate_actual_budget_amounts(p_club_id uuid, p_year integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update actual amounts based on transactions
  UPDATE budget_entries be
  SET actual_amount = COALESCE(
    (
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.club_id = p_club_id
      AND t.category_id = be.category_id
      AND EXTRACT(YEAR FROM t.date) = p_year
      AND EXTRACT(MONTH FROM t.date) = be.month
    ), 0
  )
  WHERE be.club_id = p_club_id
  AND be.year = p_year;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_budget_entries_club_year ON budget_entries(club_id, year);
CREATE INDEX IF NOT EXISTS idx_budget_entries_category ON budget_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_year_month ON budget_entries(year, month);