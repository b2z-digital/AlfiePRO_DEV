/*
  # Create budget_categories table

  1. New Tables
    - `budget_categories`
      - `id` (uuid, primary key)
      - `club_id` (uuid, foreign key to clubs)
      - `name` (text, category name)
      - `type` (text, either 'income' or 'expense')
      - `description` (text, optional description)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `budget_categories` table
    - Add policies for club members to read categories
    - Add policies for club admins to manage categories

  3. Constraints
    - Check constraint for type field (income/expense)
    - Foreign key constraint to clubs table
*/

CREATE TABLE IF NOT EXISTS budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add check constraint for type
ALTER TABLE budget_categories ADD CONSTRAINT budget_categories_type_check 
  CHECK (type = ANY (ARRAY['income'::text, 'expense'::text]));

-- Enable RLS
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Club members can view budget categories"
  ON budget_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = budget_categories.club_id 
      AND uc.user_id = uid()
    )
  );

CREATE POLICY "Club admins can manage budget categories"
  ON budget_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = budget_categories.club_id 
      AND uc.user_id = uid() 
      AND uc.role = 'admin'::club_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = budget_categories.club_id 
      AND uc.user_id = uid() 
      AND uc.role = 'admin'::club_role
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_budget_categories_updated_at
  BEFORE UPDATE ON budget_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default categories for existing clubs
INSERT INTO budget_categories (club_id, name, type, description)
SELECT 
  id as club_id,
  'Membership Fees' as name,
  'income' as type,
  'Annual membership fees from club members' as description
FROM clubs
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc WHERE bc.club_id = clubs.id
);

INSERT INTO budget_categories (club_id, name, type, description)
SELECT 
  id as club_id,
  'Event Entry Fees' as name,
  'income' as type,
  'Entry fees from racing events and competitions' as description
FROM clubs
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc WHERE bc.club_id = clubs.id AND bc.name = 'Event Entry Fees'
);

INSERT INTO budget_categories (club_id, name, type, description)
SELECT 
  id as club_id,
  'Equipment & Maintenance' as name,
  'expense' as type,
  'Costs for equipment purchase and maintenance' as description
FROM clubs
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc WHERE bc.club_id = clubs.id AND bc.name = 'Equipment & Maintenance'
);

INSERT INTO budget_categories (club_id, name, type, description)
SELECT 
  id as club_id,
  'Venue & Facilities' as name,
  'expense' as type,
  'Costs for venue rental and facility maintenance' as description
FROM clubs
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc WHERE bc.club_id = clubs.id AND bc.name = 'Venue & Facilities'
);