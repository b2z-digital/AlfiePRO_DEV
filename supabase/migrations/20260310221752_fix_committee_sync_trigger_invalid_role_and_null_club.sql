/*
  # Fix committee sync trigger for association positions

  1. Changes
    - Fix invalid 'viewer' role value (not in club_role enum) - changed to 'member'
    - Skip user_clubs sync when club_id is NULL (association-level positions)
    - The trigger now exits early for state/national association committee positions
      since those don't need user_clubs entries

  2. Bug Fixed
    - Error: "invalid input value for enum club_role: viewer" when assigning
      members to state/national association committee positions
*/

CREATE OR REPLACE FUNCTION sync_committee_access_to_user_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_user_id UUID;
  v_club_id UUID;
  v_highest_access TEXT;
  v_member_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_member_id := OLD.member_id;
    v_club_id := OLD.club_id;
  ELSE
    v_member_id := NEW.member_id;
    v_club_id := NEW.club_id;
  END IF;

  IF v_member_id IS NULL OR v_club_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT user_id INTO v_member_user_id
  FROM members
  WHERE id = v_member_id;

  IF v_member_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    CASE
      WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
      WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
      ELSE 'member'
    END INTO v_highest_access
  FROM committee_positions cp
  JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
  WHERE cp.member_id = v_member_id
    AND cp.club_id = v_club_id
    AND cpd.access_level IS NOT NULL;

  IF v_highest_access IS NULL THEN
    v_highest_access := 'member';
  END IF;

  UPDATE user_clubs
  SET role = v_highest_access::club_role,
      updated_at = now()
  WHERE user_id = v_member_user_id
    AND club_id = v_club_id;

  IF NOT FOUND THEN
    INSERT INTO user_clubs (user_id, club_id, role)
    VALUES (v_member_user_id, v_club_id, v_highest_access::club_role)
    ON CONFLICT (user_id, club_id) DO UPDATE
    SET role = v_highest_access::club_role, updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;