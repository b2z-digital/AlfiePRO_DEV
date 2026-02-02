/*
  # Add System Category Support and Auto-Create Membership Fees Category

  1. Changes to `budget_categories` table
    - Add `is_system` (boolean) - Marks categories that cannot be deleted by users
    - Add `system_key` (text) - Unique identifier for system categories (e.g., 'membership_fees')

  2. Create function `ensure_membership_fees_category`
    - Automatically creates "Membership Fees" category for a club if it doesn't exist
    - Marks it as a system category
    - Returns the category ID

  3. Purpose
    - Protect essential categories from deletion
    - Ensure membership integration always has a valid default category
    - Allow identification and labeling of system-managed categories

  4. Notes
    - System categories cannot be soft-deleted (is_active=false)
    - Function is idempotent - safe to call multiple times
*/

-- Add is_system and system_key columns to budget_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'budget_categories' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE budget_categories ADD COLUMN is_system boolean DEFAULT false NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'budget_categories' AND column_name = 'system_key'
  ) THEN
    ALTER TABLE budget_categories ADD COLUMN system_key text;
  END IF;
END $$;

-- Create unique index on club_id + system_key (for system categories)
CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_club_system_key_idx 
  ON budget_categories(club_id, system_key) 
  WHERE system_key IS NOT NULL;

-- Add check constraint to prevent soft-deleting system categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'budget_categories_system_active_check'
  ) THEN
    ALTER TABLE budget_categories 
      ADD CONSTRAINT budget_categories_system_active_check 
      CHECK (NOT is_system OR is_active = true);
  END IF;
END $$;

-- Function to ensure Membership Fees category exists for a club
CREATE OR REPLACE FUNCTION ensure_membership_fees_category(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id uuid;
  v_default_tax_rate_id uuid;
BEGIN
  -- Check if category already exists
  SELECT id INTO v_category_id
  FROM budget_categories
  WHERE club_id = p_club_id 
    AND system_key = 'membership_fees'
    AND is_active = true;

  -- If found, return it
  IF v_category_id IS NOT NULL THEN
    RETURN v_category_id;
  END IF;

  -- Get default tax rate for the club (if any)
  SELECT id INTO v_default_tax_rate_id
  FROM tax_rates
  WHERE club_id = p_club_id 
    AND is_default = true 
    AND is_active = true
  LIMIT 1;

  -- Create the category
  INSERT INTO budget_categories (
    club_id,
    name,
    type,
    description,
    is_system,
    system_key,
    is_active,
    tax_rate_id,
    created_at,
    updated_at
  ) VALUES (
    p_club_id,
    'Membership Fees',
    'income',
    'System-managed category for membership payments and renewals',
    true,
    'membership_fees',
    true,
    v_default_tax_rate_id,
    now(),
    now()
  )
  RETURNING id INTO v_category_id;

  -- Set this as the default membership category for the club
  UPDATE clubs
  SET default_membership_category_id = v_category_id
  WHERE id = p_club_id 
    AND default_membership_category_id IS NULL;

  RETURN v_category_id;
END;
$$;

-- Create the Membership Fees category for all existing clubs that don't have one
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN 
    SELECT id FROM clubs WHERE id NOT IN (
      SELECT club_id FROM budget_categories 
      WHERE system_key = 'membership_fees' AND is_active = true
    )
  LOOP
    PERFORM ensure_membership_fees_category(club_record.id);
  END LOOP;
END $$;
