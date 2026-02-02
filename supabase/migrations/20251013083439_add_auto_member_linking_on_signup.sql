/*
  # Auto-Link New Users to Existing Member Records

  ## Overview
  When a user signs up, automatically search for existing member records
  with matching email addresses and link them together.

  ## Changes
  1. Create function to auto-link new users to members
  2. Create trigger on auth.users to run after signup
  3. Also creates user_clubs entries for matched members

  ## Benefits
  - Existing members don't need invitations
  - No duplicate records
  - Instant access to their club(s) after signup
  - Seamless experience for members registering themselves

  ## Notes
  - Only links if member.user_id is NULL
  - Case-insensitive email matching
  - Links to ALL clubs where email matches
  - Creates appropriate user_clubs entries
*/

-- Function to auto-link new users to existing member records
CREATE OR REPLACE FUNCTION auto_link_user_to_members()
RETURNS TRIGGER AS $$
DECLARE
  v_member RECORD;
  v_linked_count INTEGER := 0;
BEGIN
  -- Find all member records with matching email (case-insensitive)
  -- that don't already have a user_id
  FOR v_member IN 
    SELECT id, club_id, email
    FROM members
    WHERE LOWER(email) = LOWER(NEW.email)
      AND user_id IS NULL
  LOOP
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

    -- Log the linking for debugging
    RAISE NOTICE 'Auto-linked user % to member % in club %', 
      NEW.id, v_member.id, v_member.club_id;
  END LOOP;

  -- Log if any members were linked
  IF v_linked_count > 0 THEN
    RAISE NOTICE 'Auto-linked user % to % existing member record(s)', 
      NEW.email, v_linked_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run after user signup
-- Note: This runs AFTER the handle_new_user trigger (which creates profile)
DROP TRIGGER IF EXISTS auto_link_members_on_signup ON auth.users;
CREATE TRIGGER auto_link_members_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_user_to_members();

-- Function to check if a user has any club memberships
CREATE OR REPLACE FUNCTION user_has_clubs(p_user_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_clubs
  WHERE user_id = p_user_id;
  
  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's clubs after signup
CREATE OR REPLACE FUNCTION get_user_clubs_after_signup(p_email text)
RETURNS TABLE (
  club_id uuid,
  club_name text,
  member_id uuid,
  role text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.club_id,
    c.name as club_name,
    m.id as member_id,
    uc.role
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  LEFT JOIN members m ON m.club_id = uc.club_id 
    AND m.user_id = (SELECT id FROM auth.users WHERE email = p_email LIMIT 1)
  WHERE uc.user_id = (SELECT id FROM auth.users WHERE email = p_email LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;