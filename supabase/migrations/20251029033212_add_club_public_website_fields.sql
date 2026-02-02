/*
  # Add Public Website Fields to Clubs Table
  
  1. New Columns
    - `description` (text) - Full club description for public website
    - `contact_email` (text) - Public contact email
    - `contact_phone` (text) - Public contact phone
    - `address` (text) - Full address for map display
  
  2. Changes
    - Add columns if they don't exist
    - These are all optional fields
*/

-- Add description column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'description'
  ) THEN
    ALTER TABLE clubs ADD COLUMN description text;
  END IF;
END $$;

-- Add contact_email column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'contact_email'
  ) THEN
    ALTER TABLE clubs ADD COLUMN contact_email text;
  END IF;
END $$;

-- Add contact_phone column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE clubs ADD COLUMN contact_phone text;
  END IF;
END $$;

-- Add address column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'address'
  ) THEN
    ALTER TABLE clubs ADD COLUMN address text;
  END IF;
END $$;
