/*
  # Add emergency contact fields to members table
  
  1. New Columns
    - `emergency_contact_name` (text, nullable)
    - `emergency_contact_phone` (text, nullable)
    - `emergency_contact_relationship` (text, nullable)
*/

-- Add emergency contact columns to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE members ADD COLUMN emergency_contact_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE members ADD COLUMN emergency_contact_phone text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'emergency_contact_relationship'
  ) THEN
    ALTER TABLE members ADD COLUMN emergency_contact_relationship text;
  END IF;
END $$;