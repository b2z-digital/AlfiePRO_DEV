/*
  # Fix Profile Creation Trigger to Handle Conflicts

  The profile creation trigger was failing when a user already exists because it tries to
  INSERT a profile that may already exist. This happens during invitation signup when:
  1. A member is added to the system (no auth user yet)
  2. An invitation is sent
  3. User clicks invitation link and creates account
  4. Profile already exists but trigger tries to INSERT again

  ## Changes
  - Update handle_new_user() function to use INSERT ... ON CONFLICT DO UPDATE
  - This allows the trigger to update existing profiles instead of failing
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS 
'Automatically creates or updates a profile when a new auth user is created. Handles conflicts gracefully.';
