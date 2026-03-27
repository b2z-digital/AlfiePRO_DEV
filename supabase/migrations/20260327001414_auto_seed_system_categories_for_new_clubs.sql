/*
  # Auto-seed system budget categories for new clubs

  1. Changes
    - Creates a trigger function `seed_system_budget_categories_for_new_club()`
      that runs AFTER INSERT on the `clubs` table
    - Automatically inserts the 4 required system categories:
      - Membership Fees (income) - for membership payments and renewals
      - Event Entry Fees (income) - for racing event entry fees
      - Association Fees (expense) - for association fee tracking
      - Membership Remittances (expense) - for remittance payments to associations
    - Also seeds useful default non-system categories:
      - Bank Fees (expense)
      - Equipment & Maintenance (expense)
      - Venue & Facilities (expense)
    - Backfills all existing clubs that are missing any system categories

  2. Security
    - Function uses SECURITY DEFINER to bypass RLS
    - Uses ON CONFLICT to avoid duplicates (idempotent)

  3. Important Notes
    - System categories are required for automated finance integrations
      (membership applications, event registrations, remittance payments)
    - The unique index on (club_id, system_key) prevents duplicates
    - is_system = true prevents users from deleting these categories
*/

-- Create the trigger function to seed system categories for new clubs
CREATE OR REPLACE FUNCTION seed_system_budget_categories_for_new_club()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert system categories (skip if already exists via unique index on club_id + system_key)
  INSERT INTO budget_categories (club_id, name, type, description, is_system, system_key, is_active)
  VALUES
    (NEW.id, 'Membership Fees', 'income', 'System-managed category for membership payments and renewals', true, 'membership_fees', true),
    (NEW.id, 'Event Entry Fees', 'income', 'Entry fees from racing events and competitions', true, 'event_entry_fees', true),
    (NEW.id, 'Association Fees', 'expense', 'Association fee tracking', true, 'association_fees', true),
    (NEW.id, 'Membership Remittances', 'expense', 'Membership fee remittances to state and national associations', true, 'membership_remittances', true)
  ON CONFLICT (club_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

  -- Insert useful default non-system categories
  INSERT INTO budget_categories (club_id, name, type, description, is_system, is_active)
  VALUES
    (NEW.id, 'Bank Fees', 'expense', 'Banking and transaction fees', false, true),
    (NEW.id, 'Equipment & Maintenance', 'expense', 'Equipment purchases and maintenance costs', false, true),
    (NEW.id, 'Venue & Facilities', 'expense', 'Venue hire and facility maintenance', false, true)
  ON CONFLICT DO NOTHING;

  -- Update the club's default_membership_category_id if not set
  UPDATE clubs
  SET default_membership_category_id = (
    SELECT id FROM budget_categories
    WHERE club_id = NEW.id AND system_key = 'membership_fees'
    LIMIT 1
  )
  WHERE id = NEW.id AND default_membership_category_id IS NULL;

  RETURN NEW;
END;
$$;

-- Create the trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_seed_system_budget_categories'
  ) THEN
    CREATE TRIGGER trigger_seed_system_budget_categories
      AFTER INSERT ON clubs
      FOR EACH ROW
      EXECUTE FUNCTION seed_system_budget_categories_for_new_club();
  END IF;
END $$;

-- Backfill: Insert missing system categories for ALL existing clubs
INSERT INTO budget_categories (club_id, name, type, description, is_system, system_key, is_active)
SELECT c.id, 'Membership Fees', 'income', 'System-managed category for membership payments and renewals', true, 'membership_fees', true
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'membership_fees'
)
ON CONFLICT (club_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

INSERT INTO budget_categories (club_id, name, type, description, is_system, system_key, is_active)
SELECT c.id, 'Event Entry Fees', 'income', 'Entry fees from racing events and competitions', true, 'event_entry_fees', true
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'event_entry_fees'
)
ON CONFLICT (club_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

INSERT INTO budget_categories (club_id, name, type, description, is_system, system_key, is_active)
SELECT c.id, 'Association Fees', 'expense', 'Association fee tracking', true, 'association_fees', true
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'association_fees'
)
ON CONFLICT (club_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

INSERT INTO budget_categories (club_id, name, type, description, is_system, system_key, is_active)
SELECT c.id, 'Membership Remittances', 'expense', 'Membership fee remittances to state and national associations', true, 'membership_remittances', true
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'membership_remittances'
)
ON CONFLICT (club_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

-- Backfill: Update default_membership_category_id for clubs that don't have it set
UPDATE clubs c
SET default_membership_category_id = (
  SELECT id FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'membership_fees'
  LIMIT 1
)
WHERE c.default_membership_category_id IS NULL
AND EXISTS (
  SELECT 1 FROM budget_categories bc
  WHERE bc.club_id = c.id AND bc.system_key = 'membership_fees'
);