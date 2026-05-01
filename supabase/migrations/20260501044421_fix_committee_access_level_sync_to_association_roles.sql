/*
  # Fix committee access_level sync for associations

  1. Problem
    - When an association admin changes a committee position definition's access_level
      (e.g., from "editor" to "admin"), the affected members' roles in
      user_state_associations / user_national_associations are NOT updated
    - The existing trigger only fires on INSERT/DELETE of committee_positions rows,
      not on UPDATE of committee_position_definitions.access_level
    - For association positions (club_id IS NULL), the trigger skips entirely since
      it only syncs to user_clubs

  2. Fix
    - Create a new trigger on committee_position_definitions that fires on UPDATE
      of the access_level column
    - The trigger function finds all members holding positions with that definition
      and recalculates their highest access level
    - For association positions, syncs to user_state_associations or
      user_national_associations
    - For club positions, syncs to user_clubs (existing behavior, now also triggered
      on access_level changes)

  3. Also fixes
    - The existing sync trigger now handles association-level positions (state/national)
      by updating user_state_associations / user_national_associations roles
    - When a member is assigned to an association position and already has an entry,
      their role is now upgraded if the new position grants higher access

  4. Tables affected
    - committee_position_definitions (trigger added for UPDATE)
    - user_state_associations (role may be updated)
    - user_national_associations (role may be updated)
    - user_clubs (role may be updated for club-level positions)
*/

-- Function to sync access levels when a position definition's access_level is changed
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

    -- Skip if member has no linked user account
    IF v_member_user_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Handle CLUB-level positions
    IF v_assignment.club_id IS NOT NULL THEN
      -- Recalculate highest access across all positions for this member in this club
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
      -- Recalculate highest access across all positions for this member in this state association
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

      -- Map access_level to the correct association role
      -- For state associations: admin -> 'admin', editor -> 'editor', else -> 'member'
      UPDATE user_state_associations
      SET role = v_highest_access,
          updated_at = now()
      WHERE user_id = v_member_user_id
        AND state_association_id = v_assignment.state_association_id;

    -- Handle NATIONAL ASSOCIATION positions
    ELSIF v_assignment.national_association_id IS NOT NULL THEN
      -- Recalculate highest access across all positions for this member in this national association
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

      UPDATE user_national_associations
      SET role = v_highest_access,
          updated_at = now()
      WHERE user_id = v_member_user_id
        AND national_association_id = v_assignment.national_association_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on committee_position_definitions for access_level changes
DROP TRIGGER IF EXISTS sync_position_def_access_level_trigger ON committee_position_definitions;

CREATE TRIGGER sync_position_def_access_level_trigger
  AFTER UPDATE ON committee_position_definitions
  FOR EACH ROW
  WHEN (OLD.access_level IS DISTINCT FROM NEW.access_level)
  EXECUTE FUNCTION sync_position_definition_access_level_change();


-- Also fix the existing committee_positions INSERT/DELETE trigger to handle association positions
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

  -- Get the user_id for this member
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

    UPDATE user_state_associations
    SET role = v_highest_access,
        updated_at = now()
    WHERE user_id = v_member_user_id
      AND state_association_id = v_state_association_id;

    IF NOT FOUND THEN
      INSERT INTO user_state_associations (user_id, state_association_id, role)
      VALUES (v_member_user_id, v_state_association_id, v_highest_access)
      ON CONFLICT (user_id, state_association_id) DO UPDATE
      SET role = v_highest_access, updated_at = now();
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

    UPDATE user_national_associations
    SET role = v_highest_access,
        updated_at = now()
    WHERE user_id = v_member_user_id
      AND national_association_id = v_national_association_id;

    IF NOT FOUND THEN
      INSERT INTO user_national_associations (user_id, national_association_id, role)
      VALUES (v_member_user_id, v_national_association_id, v_highest_access)
      ON CONFLICT (user_id, national_association_id) DO UPDATE
      SET role = v_highest_access, updated_at = now();
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
