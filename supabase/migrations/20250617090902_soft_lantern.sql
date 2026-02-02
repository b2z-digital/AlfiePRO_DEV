/*
  # Add emergency contact columns to members table

  1. Changes
    - Add `emergency_contact_name` column to members table
    - Add `emergency_contact_phone` column to members table  
    - Add `emergency_contact_relationship` column to members table

  2. Security
    - No changes to RLS policies needed as these are just additional data fields
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