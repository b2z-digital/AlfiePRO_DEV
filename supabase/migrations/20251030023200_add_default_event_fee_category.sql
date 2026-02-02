/*
  # Add Default Event Fees Category

  1. Changes
    - Ensures all clubs have an "Event Fees" income category
    - Creates the category if it doesn't exist
    - Marks it as a system category

  2. Security
    - No RLS changes needed (uses existing policies)
*/

-- Function to ensure event fees category exists for all clubs
CREATE OR REPLACE FUNCTION ensure_event_fees_category()
RETURNS void AS $$
BEGIN
  -- Insert Event Fees category for clubs that don't have it
  INSERT INTO finance_categories (club_id, name, type, description, is_system)
  SELECT
    c.id,
    'Event Fees',
    'income',
    'Income from race and event entry fees',
    true
  FROM clubs c
  WHERE NOT EXISTS (
    SELECT 1 FROM finance_categories fc
    WHERE fc.club_id = c.id
    AND fc.name = 'Event Fees'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the function to create categories for existing clubs
SELECT ensure_event_fees_category();

-- Create trigger to automatically create Event Fees category for new clubs
CREATE OR REPLACE FUNCTION create_event_fees_category_for_new_club()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO finance_categories (club_id, name, type, description, is_system)
  VALUES (NEW.id, 'Event Fees', 'income', 'Income from race and event entry fees', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (to avoid duplicate trigger error)
DROP TRIGGER IF EXISTS trigger_create_event_fees_category ON clubs;

CREATE TRIGGER trigger_create_event_fees_category
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION create_event_fees_category_for_new_club();
