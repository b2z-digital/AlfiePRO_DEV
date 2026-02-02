/*
  # Ensure Profile Creation Trigger Bypasses RLS

  The profile creation trigger needs to bypass RLS entirely because:
  1. It runs during user creation when no session exists
  2. The new user is not yet authenticated
  3. RLS policies block the INSERT

  ## Changes
  - Update handle_new_user() to run with SECURITY DEFINER and set search_path
  - Set the function to run as the postgres user (service role equivalent)
  - This ensures RLS is bypassed for profile creation
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile or update if it already exists
  -- This runs with elevated privileges, bypassing RLS
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Grant execute permission to authenticated and service role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role, anon;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS 
'Automatically creates or updates a profile when a new auth user is created. Runs with elevated privileges to bypass RLS. Handles errors gracefully to prevent blocking user creation.';
