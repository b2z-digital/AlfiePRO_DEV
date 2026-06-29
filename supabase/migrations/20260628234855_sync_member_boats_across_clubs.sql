/*
  # Sync member_boats across cross-club member records

  1. Problem
    - Members who belong to multiple clubs (e.g., RSYS and HMYC) have separate
      member records per club
    - When a boat is added to one member record, it doesn't appear under the
      other club's member record
    - Admin views only show boats for the current club's member_id

  2. Solution
    - Create a trigger that copies new boat records to all other member records
      sharing the same user_id when a boat is inserted
    - When a boat is updated, sync changes to matching boats on other member records
    - When a boat is deleted, remove matching boats from other member records
    - Matching is done by sail_number + boat_type (the unique boat identity)
    - Uses a session variable to prevent infinite recursion

  3. Backfill
    - Copy existing boats to cross-club member records that are missing them
*/

-- Function to sync boats to all member records for the same user (INSERT)
CREATE OR REPLACE FUNCTION public.sync_boat_across_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_other_member RECORD;
BEGIN
  -- Prevent recursion: if we're already syncing, skip
  IF current_setting('app.syncing_boats', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Get the user_id for the member who owns this boat
  SELECT user_id INTO v_user_id
  FROM members
  WHERE id = NEW.member_id;

  -- If no user_id (member not linked to a user account), skip sync
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set recursion guard
  PERFORM set_config('app.syncing_boats', 'true', true);

  -- For each other member record of the same user, insert the boat
  FOR v_other_member IN
    SELECT id FROM members
    WHERE user_id = v_user_id
      AND id != NEW.member_id
      AND membership_status != 'archived'
  LOOP
    -- Insert the boat if it doesn't already exist for that member
    INSERT INTO member_boats (
      member_id, boat_type, sail_number, hull, handicap,
      image_url, description, purchase_date, purchase_value,
      specifications, is_primary
    )
    SELECT
      v_other_member.id, NEW.boat_type, NEW.sail_number, NEW.hull, NEW.handicap,
      NEW.image_url, NEW.description, NEW.purchase_date, NEW.purchase_value,
      NEW.specifications, NEW.is_primary
    WHERE NOT EXISTS (
      SELECT 1 FROM member_boats
      WHERE member_id = v_other_member.id
        AND sail_number = NEW.sail_number
        AND boat_type = NEW.boat_type
    );
  END LOOP;

  -- Reset recursion guard
  PERFORM set_config('app.syncing_boats', 'false', true);

  RETURN NEW;
END;
$$;

-- Function to sync boat updates across clubs
CREATE OR REPLACE FUNCTION public.sync_boat_update_across_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Prevent recursion
  IF current_setting('app.syncing_boats', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Get the user_id for the member who owns this boat
  SELECT user_id INTO v_user_id
  FROM members
  WHERE id = NEW.member_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set recursion guard
  PERFORM set_config('app.syncing_boats', 'true', true);

  -- Update matching boats on other member records (match by old sail_number + boat_type)
  UPDATE member_boats mb
  SET boat_type = NEW.boat_type,
      sail_number = NEW.sail_number,
      hull = NEW.hull,
      handicap = NEW.handicap,
      image_url = NEW.image_url,
      description = NEW.description,
      purchase_date = NEW.purchase_date,
      purchase_value = NEW.purchase_value,
      specifications = NEW.specifications,
      is_primary = NEW.is_primary
  FROM members m
  WHERE mb.member_id = m.id
    AND m.user_id = v_user_id
    AND m.id != NEW.member_id
    AND m.membership_status != 'archived'
    AND mb.sail_number = OLD.sail_number
    AND mb.boat_type = OLD.boat_type;

  -- Reset recursion guard
  PERFORM set_config('app.syncing_boats', 'false', true);

  RETURN NEW;
END;
$$;

-- Function to sync boat deletions across clubs
CREATE OR REPLACE FUNCTION public.sync_boat_delete_across_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Prevent recursion
  IF current_setting('app.syncing_boats', true) = 'true' THEN
    RETURN OLD;
  END IF;

  -- Get the user_id for the member who owns this boat
  SELECT user_id INTO v_user_id
  FROM members
  WHERE id = OLD.member_id;

  IF v_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Set recursion guard
  PERFORM set_config('app.syncing_boats', 'true', true);

  -- Delete matching boats on other member records
  DELETE FROM member_boats mb
  USING members m
  WHERE mb.member_id = m.id
    AND m.user_id = v_user_id
    AND m.id != OLD.member_id
    AND m.membership_status != 'archived'
    AND mb.sail_number = OLD.sail_number
    AND mb.boat_type = OLD.boat_type;

  -- Reset recursion guard
  PERFORM set_config('app.syncing_boats', 'false', true);

  RETURN OLD;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_sync_boat_insert_across_clubs ON member_boats;
CREATE TRIGGER trigger_sync_boat_insert_across_clubs
  AFTER INSERT ON member_boats
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_boat_across_clubs();

DROP TRIGGER IF EXISTS trigger_sync_boat_update_across_clubs ON member_boats;
CREATE TRIGGER trigger_sync_boat_update_across_clubs
  AFTER UPDATE ON member_boats
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_boat_update_across_clubs();

DROP TRIGGER IF EXISTS trigger_sync_boat_delete_across_clubs ON member_boats;
CREATE TRIGGER trigger_sync_boat_delete_across_clubs
  AFTER DELETE ON member_boats
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_boat_delete_across_clubs();

-- Backfill: Copy existing boats to cross-club member records that are missing them
-- Use set_config to prevent the trigger from firing during backfill
SELECT set_config('app.syncing_boats', 'true', false);

INSERT INTO member_boats (member_id, boat_type, sail_number, hull, handicap, image_url, description, purchase_date, purchase_value, specifications, is_primary)
SELECT DISTINCT ON (other_m.id, mb.sail_number, mb.boat_type)
  other_m.id AS member_id,
  mb.boat_type,
  mb.sail_number,
  mb.hull,
  mb.handicap,
  mb.image_url,
  mb.description,
  mb.purchase_date,
  mb.purchase_value,
  mb.specifications,
  mb.is_primary
FROM member_boats mb
JOIN members src_m ON src_m.id = mb.member_id
JOIN members other_m ON other_m.user_id = src_m.user_id
  AND other_m.id != src_m.id
  AND other_m.membership_status != 'archived'
WHERE src_m.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM member_boats existing
    WHERE existing.member_id = other_m.id
      AND existing.sail_number = mb.sail_number
      AND existing.boat_type = mb.boat_type
  );

SELECT set_config('app.syncing_boats', 'false', false);
