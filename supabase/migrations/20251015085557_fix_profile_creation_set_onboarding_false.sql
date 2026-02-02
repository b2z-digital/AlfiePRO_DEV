/*
  # Fix Profile Creation to Set Onboarding as Incomplete
  
  1. Problem
    - New user profiles are created without onboarding_completed field
    - This defaults to NULL or TRUE, allowing users to bypass onboarding
    - Users can access dashboard without completing setup
  
  2. Changes
    - Update handle_new_user() to explicitly set onboarding_completed = false
    - This ensures all new users go through onboarding
  
  3. Security
    - Users must complete onboarding before accessing the dashboard
    - Maintains security by preventing unauthorized access
*/

-- Update handle_new_user to set onboarding_completed to false for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    -- Insert profile with onboarding_completed = false
    INSERT INTO public.profiles (id, first_name, last_name, onboarding_completed, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      false,
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      updated_at = now();

    RAISE LOG 'Successfully created/updated profile for user % with onboarding_completed = false', NEW.id;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error but don't fail the user creation
      RAISE WARNING 'handle_new_user: Failed to create profile for user %: % (SQLSTATE: %)', 
        NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 
'Creates or updates profile when auth user is created with onboarding_completed set to false. Has error handling to prevent blocking signup.';
