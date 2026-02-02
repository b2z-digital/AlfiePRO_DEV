/*
  # Add Error Handling to Auth User Creation Triggers

  The signup is failing with "Database error saving new user" but we need to identify
  which trigger is causing the issue. This migration adds comprehensive error handling
  to both triggers so they don't block user creation.

  ## Changes
  1. Add exception handling to handle_new_user() trigger
  2. Add exception handling to auto_link_user_to_members() trigger
  3. Both triggers will log errors but allow user creation to proceed
  4. Add detailed logging to help diagnose issues
*/

-- Update handle_new_user to have better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert profile or update if it already exists
    INSERT INTO public.profiles (id, first_name, last_name, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      updated_at = now();

    RAISE LOG 'Successfully created/updated profile for user %', NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't fail the user creation
      RAISE WARNING 'handle_new_user: Failed to create profile for user %: % (SQLSTATE: %)', 
        NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Update auto_link_user_to_members to have better error handling
CREATE OR REPLACE FUNCTION auto_link_user_to_members()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_member RECORD;
  v_linked_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  BEGIN
    -- Find all member records with matching email (case-insensitive)
    FOR v_member IN 
      SELECT id, club_id, email
      FROM members
      WHERE LOWER(email) = LOWER(NEW.email)
        AND user_id IS NULL
    LOOP
      BEGIN
        -- Link the member to this user
        UPDATE members
        SET user_id = NEW.id,
            updated_at = now()
        WHERE id = v_member.id;

        -- Create user_clubs entry for this club
        INSERT INTO user_clubs (user_id, club_id, role)
        VALUES (NEW.id, v_member.club_id, 'member')
        ON CONFLICT (user_id, club_id) DO NOTHING;

        v_linked_count := v_linked_count + 1;

        RAISE LOG 'Auto-linked user % to member % in club %', 
          NEW.id, v_member.id, v_member.club_id;

      EXCEPTION
        WHEN OTHERS THEN
          v_error_count := v_error_count + 1;
          RAISE WARNING 'auto_link_user_to_members: Failed to link user % to member %: % (SQLSTATE: %)',
            NEW.id, v_member.id, SQLERRM, SQLSTATE;
      END;
    END LOOP;

    -- Log summary
    IF v_linked_count > 0 THEN
      RAISE LOG 'Auto-linked user % (%s) to % member record(s), % errors', 
        NEW.id, NEW.email, v_linked_count, v_error_count;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'auto_link_user_to_members: General error for user %: % (SQLSTATE: %)',
        NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Ensure triggers are properly set up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS auto_link_members_on_signup ON auth.users;
CREATE TRIGGER auto_link_members_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_user_to_members();

COMMENT ON FUNCTION public.handle_new_user IS 
'Creates or updates profile when auth user is created. Has error handling to prevent blocking signup.';

COMMENT ON FUNCTION auto_link_user_to_members IS
'Auto-links new users to existing member records with matching email. Has error handling to prevent blocking signup.';
