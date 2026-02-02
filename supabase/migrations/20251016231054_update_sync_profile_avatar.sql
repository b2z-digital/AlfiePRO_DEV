/*
  # Update sync_profile_from_member to include avatar_url
  
  Updates the sync_profile_from_member function to also sync the avatar_url
  from members table to profiles table, ensuring avatars are kept in sync.
*/

CREATE OR REPLACE FUNCTION sync_profile_from_member()
RETURNS TRIGGER AS $$
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;