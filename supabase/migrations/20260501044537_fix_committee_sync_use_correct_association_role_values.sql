/*
  # Fix committee sync to use correct association role values

  1. Problem
    - The previous migration used 'admin' as the role value for state/national associations
    - But the system uses 'state_admin' for state associations and 'national_admin' for national
    - This means the trigger would set wrong role values that don't grant admin access

  2. Fix
    - Update both sync functions to map access_level='admin' to the correct role:
      - State associations: 'state_admin'
      - National associations: 'national_admin'
    - 'editor' remains 'editor' for both
    - Default remains 'member' for both
*/

-- Fix the position definition access_level change trigger
CREATE OR REPLACE FUNCTION sync_position_definition_access_level_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_member_user_id UUID;
  v_highest_access TEXT;
  v_role_value TEXT;
BEGIN
  -- Only act if access_level actually changed
  IF OLD.access_level IS NOT DISTINCT FROM NEW.access_level THEN
    RETURN NEW;
  END IF;

  -- Find all committee_positions that reference this definition
  FOR v_assignment IN
    SELECT cp.member_id, cp.club_id, cp.state_association_id, cp.national_association_id
    FROM committee_positions cp
    WHERE cp.position_definition_id = NEW.id
  LOOP
    -- Get the user_id for this member
    SELECT user_id INTO v_member_user_id
    FROM members
    WHERE id = v_assignment.member_id;

    IF v_member_user_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Handle CLUB-level positions
    IF v_assignment.club_id IS NOT NULL THEN
      SELECT
        CASE
          WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
          WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
          ELSE 'member'
        END INTO v_highest_access
      FROM committee_positions cp
      JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
      WHERE cp.member_id = v_assignment.member_id
        AND cp.club_id = v_assignment.club_id
        AND cpd.access_level IS NOT NULL;

      IF v_highest_access IS NULL THEN
        v_highest_access := 'member';
      END IF;

      UPDATE user_clubs
      SET role = v_highest_access::club_role,
          updated_at = now()
      WHERE user_id = v_member_user_id
        AND club_id = v_assignment.club_id;

    -- Handle STATE ASSOCIATION positions
    ELSIF v_assignment.state_association_id IS NOT NULL THEN
      SELECT
        CASE
          WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
          WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
          ELSE 'member'
        END INTO v_highest_access
      FROM committee_positions cp
      JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
      WHERE cp.member_id = v_assignment.member_id
        AND cp.state_association_id = v_assignment.state_association_id
        AND cpd.access_level IS NOT NULL;

      IF v_highest_access IS NULL THEN
        v_highest_access := 'member';
      END IF;

      -- Map to correct role value for state associations
      v_role_value := CASE v_highest_access
        WHEN 'admin' THEN 'state_admin'
        WHEN 'editor' THEN 'editor'
        ELSE 'member'
      END;

      UPDATE user_state_associations
      SET role = v_role_value,
          updated_at = now()
      WHERE user_id = v_member_user_id
        AND state_association_id = v_assignment.state_association_id;

    -- Handle NATIONAL ASSOCIATION positions
    ELSIF v_assignment.national_association_id IS NOT NULL THEN
      SELECT
        CASE
          WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
          WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
          ELSE 'member'
        END INTO v_highest_access
      FROM committee_positions cp
      JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
      WHERE cp.member_id = v_assignment.member_id
        AND cp.national_association_id = v_assignment.national_association_id
        AND cpd.access_level IS NOT NULL;

      IF v_highest_access IS NULL THEN
        v_highest_access := 'member';
      END IF;

      -- Map to correct role value for national associations
      v_role_value := CASE v_highest_access
        WHEN 'admin' THEN 'national_admin'
        WHEN 'editor' THEN 'editor'
        ELSE 'member'
      END;

      UPDATE user_national_associations
      SET role = v_role_value,
          updated_at = now()
      WHERE user_id = v_member_user_id
        AND national_association_id = v_assignment.national_association_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- Also fix the INSERT/DELETE trigger to use correct association role values
CREATE OR REPLACE FUNCTION sync_committee_access_to_user_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_user_id UUID;
  v_club_id UUID;
  v_state_association_id UUID;
  v_national_association_id UUID;
  v_highest_access TEXT;
  v_role_value TEXT;
  v_member_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_member_id := OLD.member_id;
    v_club_id := OLD.club_id;
    v_state_association_id := OLD.state_association_id;
    v_national_association_id := OLD.national_association_id;
  ELSE
    v_member_id := NEW.member_id;
    v_club_id := NEW.club_id;
    v_state_association_id := NEW.state_association_id;
    v_national_association_id := NEW.national_association_id;
  END IF;

  IF v_member_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT user_id INTO v_member_user_id
  FROM members
  WHERE id = v_member_id;

  IF v_member_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Handle CLUB-level positions
  IF v_club_id IS NOT NULL THEN
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

  -- Handle STATE ASSOCIATION positions
  ELSIF v_state_association_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
        WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
        ELSE 'member'
      END INTO v_highest_access
    FROM committee_positions cp
    JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
    WHERE cp.member_id = v_member_id
      AND cp.state_association_id = v_state_association_id
      AND cpd.access_level IS NOT NULL;

    IF v_highest_access IS NULL THEN
      v_highest_access := 'member';
    END IF;

    v_role_value := CASE v_highest_access
      WHEN 'admin' THEN 'state_admin'
      WHEN 'editor' THEN 'editor'
      ELSE 'member'
    END;

    UPDATE user_state_associations
    SET role = v_role_value,
        updated_at = now()
    WHERE user_id = v_member_user_id
      AND state_association_id = v_state_association_id;

    IF NOT FOUND THEN
      INSERT INTO user_state_associations (user_id, state_association_id, role)
      VALUES (v_member_user_id, v_state_association_id, v_role_value)
      ON CONFLICT (user_id, state_association_id) DO UPDATE
      SET role = v_role_value, updated_at = now();
    END IF;

  -- Handle NATIONAL ASSOCIATION positions
  ELSIF v_national_association_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
        WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
        ELSE 'member'
      END INTO v_highest_access
    FROM committee_positions cp
    JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
    WHERE cp.member_id = v_member_id
      AND cp.national_association_id = v_national_association_id
      AND cpd.access_level IS NOT NULL;

    IF v_highest_access IS NULL THEN
      v_highest_access := 'member';
    END IF;

    v_role_value := CASE v_highest_access
      WHEN 'admin' THEN 'national_admin'
      WHEN 'editor' THEN 'editor'
      ELSE 'member'
    END;

    UPDATE user_national_associations
    SET role = v_role_value,
        updated_at = now()
    WHERE user_id = v_member_user_id
      AND national_association_id = v_national_association_id;

    IF NOT FOUND THEN
      INSERT INTO user_national_associations (user_id, national_association_id, role)
      VALUES (v_member_user_id, v_national_association_id, v_role_value)
      ON CONFLICT (user_id, national_association_id) DO UPDATE
      SET role = v_role_value, updated_at = now();
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
