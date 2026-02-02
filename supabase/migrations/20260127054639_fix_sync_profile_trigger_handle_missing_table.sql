/*
  # Fix sync_profile_from_member trigger to handle missing profiles table
  
  Updates the sync_profile_from_member function to gracefully handle the case
  where the profiles table doesn't exist, preventing errors during member updates.
  
  1. Changes
    - Wraps profile sync logic in exception handler
    - Allows member updates to succeed even if profiles table is missing
    - Logs errors for debugging without blocking the operation
*/

-- Update sync_profile_from_member function to handle missing table
CREATE OR REPLACE FUNCTION sync_profile_from_member()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only proceed if user_id is set
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try to sync profile, but don't fail if profiles table doesn't exist
  BEGIN
    -- Update profile with member data including avatar
    UPDATE profiles
    SET 
      first_name = NEW.first_name,
      last_name = NEW.last_name,
      email = NEW.email,
      avatar_url = NEW.avatar_url,
      updated_at = now()
    WHERE id = NEW.user_id;

    -- If profile doesn't exist, create it
    IF NOT FOUND THEN
      INSERT INTO profiles (id, first_name, last_name, email, avatar_url, created_at, updated_at)
      VALUES (NEW.user_id, NEW.first_name, NEW.last_name, NEW.email, NEW.avatar_url, now(), now())
      ON CONFLICT (id) DO UPDATE
      SET 
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = now();
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      -- Profiles table doesn't exist - log but don't fail
      RAISE WARNING 'Profiles table does not exist, skipping profile sync';
    WHEN OTHERS THEN
      -- Log other errors but don't fail the member update
      RAISE WARNING 'Error syncing profile: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;