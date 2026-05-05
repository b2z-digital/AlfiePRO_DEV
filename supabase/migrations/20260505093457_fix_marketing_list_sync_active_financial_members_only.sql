/*
  # Fix Marketing Club Members List to Only Include Active Financial Members

  1. Changes
    - Updates `ensure_all_members_list` function to only include members who are:
      - Active (membership_status = 'active' or NULL)
      - Financial (is_financial = true)
      - Have a valid email address
    - Updates `sync_member_to_marketing_list` trigger function to:
      - Remove members from list when they become non-financial or cancelled/archived
      - Only add members who are both active and financial
    - Updates `remove_member_from_marketing_list` function to also handle cancelled status
    - Re-syncs existing Club Members lists to remove non-active/non-financial members
    - Updates trigger to also fire on `is_financial` column changes

  2. Impact
    - Club Members marketing list will now match the active members count shown on the Members page
    - Members who are overdue (is_financial = false) or cancelled will be excluded
    - Existing lists will be cleaned up to remove members who don't meet the criteria
*/

-- Update the ensure_all_members_list function to only include active financial members
CREATE OR REPLACE FUNCTION public.ensure_all_members_list(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_member record;
BEGIN
  SELECT id INTO v_list_id
  FROM marketing_subscriber_lists
  WHERE club_id = p_club_id AND list_type = 'all_members'
  LIMIT 1;

  IF v_list_id IS NULL THEN
    INSERT INTO marketing_subscriber_lists (name, description, club_id, list_type, total_contacts, active_subscriber_count)
    VALUES ('Club Members', 'Automatically synced list of active financial club members', p_club_id, 'all_members', 0, 0)
    RETURNING id INTO v_list_id;

    FOR v_member IN
      SELECT id, email, first_name, last_name
      FROM members
      WHERE club_id = p_club_id
        AND email IS NOT NULL
        AND email != ''
        AND is_financial = true
        AND (membership_status IS NULL OR membership_status = 'active')
    LOOP
      INSERT INTO marketing_list_members (list_id, email, first_name, last_name, member_id, status)
      VALUES (v_list_id, v_member.email, v_member.first_name, v_member.last_name, v_member.id, 'subscribed')
      ON CONFLICT DO NOTHING;
    END LOOP;

    UPDATE marketing_subscriber_lists
    SET total_contacts = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id),
        active_subscriber_count = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id AND status = 'subscribed')
    WHERE id = v_list_id;
  END IF;

  RETURN v_list_id;
END;
$$;

-- Update sync trigger to check is_financial and handle cancelled/non-financial members
CREATE OR REPLACE FUNCTION public.sync_member_to_marketing_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  -- Skip if no email
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  -- Remove from list if archived, cancelled, or not financial
  IF NEW.membership_status IN ('archived', 'cancelled') OR NEW.is_financial IS NOT TRUE THEN
    SELECT id INTO v_list_id
    FROM marketing_subscriber_lists
    WHERE club_id = NEW.club_id AND list_type = 'all_members'
    LIMIT 1;

    IF v_list_id IS NOT NULL THEN
      DELETE FROM marketing_list_members WHERE list_id = v_list_id AND member_id = NEW.id;

      UPDATE marketing_subscriber_lists
      SET total_contacts = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id),
          active_subscriber_count = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id AND status = 'subscribed')
      WHERE id = v_list_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Member is active and financial - ensure they are in the list
  v_list_id := ensure_all_members_list(NEW.club_id);

  INSERT INTO marketing_list_members (list_id, email, first_name, last_name, member_id, status)
  VALUES (v_list_id, NEW.email, NEW.first_name, NEW.last_name, NEW.id, 'subscribed')
  ON CONFLICT (list_id, email) DO UPDATE
  SET first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      member_id = EXCLUDED.member_id,
      status = CASE WHEN marketing_list_members.status = 'unsubscribed' THEN 'unsubscribed' ELSE 'subscribed' END;

  UPDATE marketing_subscriber_lists
  SET total_contacts = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id),
      active_subscriber_count = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id AND status = 'subscribed')
  WHERE id = v_list_id;

  RETURN NEW;
END;
$$;

-- Update remove function to also handle cancelled status
CREATE OR REPLACE FUNCTION public.remove_member_from_marketing_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_club_id uuid;
BEGIN
  v_club_id := COALESCE(OLD.club_id, NEW.club_id);

  SELECT id INTO v_list_id
  FROM marketing_subscriber_lists
  WHERE club_id = v_club_id
    AND list_type = 'all_members'
  LIMIT 1;

  IF v_list_id IS NOT NULL THEN
    IF (TG_OP = 'DELETE') OR (NEW.membership_status IN ('archived', 'cancelled')) OR (NEW.is_financial IS NOT TRUE) THEN
      DELETE FROM marketing_list_members
      WHERE list_id = v_list_id
        AND member_id = OLD.id;

      UPDATE marketing_subscriber_lists
      SET total_contacts = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id),
          active_subscriber_count = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list_id AND status = 'subscribed')
      WHERE id = v_list_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop and recreate triggers to include is_financial column changes
DROP TRIGGER IF EXISTS sync_member_to_marketing_on_insert ON members;
DROP TRIGGER IF EXISTS sync_member_to_marketing_on_update ON members;
DROP TRIGGER IF EXISTS remove_member_from_marketing_on_delete ON members;

CREATE TRIGGER sync_member_to_marketing_on_insert
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_to_marketing_list();

CREATE TRIGGER sync_member_to_marketing_on_update
  AFTER UPDATE OF email, first_name, last_name, membership_status, is_financial ON members
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_to_marketing_list();

CREATE TRIGGER remove_member_from_marketing_on_delete
  AFTER DELETE ON members
  FOR EACH ROW
  EXECUTE FUNCTION remove_member_from_marketing_list();

-- Re-sync all existing Club Members lists to remove non-active/non-financial members
DO $$
DECLARE
  v_list record;
BEGIN
  FOR v_list IN
    SELECT id, club_id FROM marketing_subscriber_lists WHERE list_type = 'all_members'
  LOOP
    -- Remove members who are not active financial
    DELETE FROM marketing_list_members
    WHERE list_id = v_list.id
      AND member_id IS NOT NULL
      AND member_id NOT IN (
        SELECT id FROM members
        WHERE club_id = v_list.club_id
          AND email IS NOT NULL
          AND email != ''
          AND is_financial = true
          AND (membership_status IS NULL OR membership_status = 'active')
      );

    -- Update counts
    UPDATE marketing_subscriber_lists
    SET total_contacts = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list.id),
        active_subscriber_count = (SELECT count(*) FROM marketing_list_members WHERE list_id = v_list.id AND status = 'subscribed')
    WHERE id = v_list.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';