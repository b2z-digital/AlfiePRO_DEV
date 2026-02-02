/*
  # Populate Profile from Member Data on Signup

  When a member accepts an invitation and signs up, their profile should be
  populated with their name from the members table, not default to "John Doe".

  ## Changes
  1. Update the auth trigger to check for linked member data
  2. If member exists with matching email/user_id, use their first_name and last_name
  3. Otherwise fall back to user_metadata or defaults
*/

-- Drop existing trigger and function to recreate
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user_profile();

-- Create improved function that pulls name from member data
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_member record;
BEGIN
  RAISE LOG 'handle_new_user_profile: Creating profile for user %', NEW.id;

  -- Try to find a member record linked to this user (by user_id or email)
  SELECT first_name, last_name INTO v_member
  FROM members
  WHERE user_id = NEW.id OR LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  -- Insert profile with member data if found, otherwise use metadata or defaults
  BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(
        v_member.first_name,
        NEW.raw_user_meta_data->>'first_name',
        'John'
      ),
      COALESCE(
        v_member.last_name,
        NEW.raw_user_meta_data->>'last_name',
        'Doe'
      ),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      first_name = COALESCE(
        v_member.first_name,
        EXCLUDED.first_name,
        profiles.first_name
      ),
      last_name = COALESCE(
        v_member.last_name,
        EXCLUDED.last_name,
        profiles.last_name
      ),
      updated_at = now();

    IF v_member.first_name IS NOT NULL THEN
      RAISE LOG 'handle_new_user_profile: Profile created with member data: % %',
        v_member.first_name, v_member.last_name;
    ELSE
      RAISE LOG 'handle_new_user_profile: Profile created with metadata/defaults';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_user_profile: Error creating profile: % (SQLSTATE %)',
        SQLERRM, SQLSTATE;
      RAISE;
  END;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_profile();

COMMENT ON FUNCTION handle_new_user_profile IS
'Creates a profile for new users, pulling name from linked member record if available';
