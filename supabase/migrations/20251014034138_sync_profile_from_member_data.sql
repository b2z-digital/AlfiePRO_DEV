/*
  # Sync Profile Data from Members Table
  
  This migration creates a function to sync profile data (first_name, last_name)
  from the members table when a user logs in or their member data is updated.
  
  1. Creates a function to sync profile from member data
  2. Creates a trigger to keep profile in sync when member data changes
  3. Adds email column to profiles table for easier lookups
  4. Populates existing profiles with member data
*/

-- Add email column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email TEXT;
    CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);
  END IF;
END $$;

-- Function to sync profile from member data
CREATE OR REPLACE FUNCTION sync_profile_from_member()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update profile with member data
  UPDATE profiles
  SET 
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    email = NEW.email,
    updated_at = now()
  WHERE id = NEW.user_id;
  
  -- If profile doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO profiles (id, first_name, last_name, email, created_at, updated_at)
    VALUES (NEW.user_id, NEW.first_name, NEW.last_name, NEW.email, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET 
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      email = EXCLUDED.email,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_profile_on_member_update ON members;

-- Create trigger to sync profile when member is inserted or updated
CREATE TRIGGER sync_profile_on_member_update
AFTER INSERT OR UPDATE OF first_name, last_name, email, user_id
ON members
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL)
EXECUTE FUNCTION sync_profile_from_member();

-- Populate existing profiles with member data
DO $$
DECLARE
  member_rec RECORD;
BEGIN
  FOR member_rec IN 
    SELECT DISTINCT ON (user_id) 
      user_id, first_name, last_name, email
    FROM members
    WHERE user_id IS NOT NULL
    ORDER BY user_id, updated_at DESC
  LOOP
    INSERT INTO profiles (id, first_name, last_name, email, created_at, updated_at)
    VALUES (member_rec.user_id, member_rec.first_name, member_rec.last_name, member_rec.email, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET 
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      email = EXCLUDED.email,
      updated_at = now();
  END LOOP;
END $$;
