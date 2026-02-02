/*
  # Auto-Sync All Members Marketing List

  Creates automatic "All Members" subscriber list for marketing campaigns.

  1. Functions
    - `ensure_all_members_list`: Creates default "All Members" list if it doesn't exist
    - `sync_member_to_marketing_list`: Auto-adds new members to the list
    - `remove_member_from_marketing_list`: Removes archived/deleted members

  2. Triggers
    - After member insert: Add to marketing list
    - After member update (archived): Remove from marketing list
    - After member delete: Remove from marketing list

  3. Changes
    - Ensures every club has an auto-synced "All Members" list
    - Keeps list synchronized with members table
*/

-- Function to ensure "All Members" list exists for a club
CREATE OR REPLACE FUNCTION ensure_all_members_list(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  -- Check if "All Members" list already exists
  SELECT id INTO v_list_id
  FROM marketing_subscriber_lists
  WHERE club_id = p_club_id
    AND list_type = 'all_members'
  LIMIT 1;

  -- Create it if it doesn't exist
  IF v_list_id IS NULL THEN
    INSERT INTO marketing_subscriber_lists (
      name,
      description,
      club_id,
      list_type,
      subscriber_count
    )
    VALUES (
      'All Members',
      'Automatically includes all active club members',
      p_club_id,
      'all_members',
      0
    )
    RETURNING id INTO v_list_id;

    -- Populate with existing members
    INSERT INTO marketing_list_members (
      list_id,
      email,
      first_name,
      last_name,
      member_id,
      status,
      source
    )
    SELECT
      v_list_id,
      m.email,
      m.first_name,
      m.last_name,
      m.id,
      'subscribed',
      'auto_sync'
    FROM members m
    WHERE m.club_id = p_club_id
      AND m.email IS NOT NULL
      AND m.email != ''
      AND (m.membership_status IS NULL OR m.membership_status != 'archived')
    ON CONFLICT (list_id, email) DO NOTHING;

    -- Update count
    UPDATE marketing_subscriber_lists
    SET subscriber_count = (
      SELECT COUNT(*) FROM marketing_list_members WHERE list_id = v_list_id
    )
    WHERE id = v_list_id;
  END IF;

  RETURN v_list_id;
END;
$$;

-- Function to sync new member to marketing list
CREATE OR REPLACE FUNCTION sync_member_to_marketing_list()
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

  -- Skip if archived
  IF NEW.membership_status = 'archived' THEN
    RETURN NEW;
  END IF;

  -- Ensure list exists
  v_list_id := ensure_all_members_list(NEW.club_id);

  -- Add member to list
  INSERT INTO marketing_list_members (
    list_id,
    email,
    first_name,
    last_name,
    member_id,
    status,
    source
  )
  VALUES (
    v_list_id,
    NEW.email,
    NEW.first_name,
    NEW.last_name,
    NEW.id,
    'subscribed',
    'auto_sync'
  )
  ON CONFLICT (list_id, email)
  DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    member_id = EXCLUDED.member_id,
    status = CASE
      WHEN marketing_list_members.status = 'unsubscribed' THEN 'unsubscribed'
      ELSE 'subscribed'
    END;

  -- Update count
  UPDATE marketing_subscriber_lists
  SET subscriber_count = (
    SELECT COUNT(*) FROM marketing_list_members WHERE list_id = v_list_id
  )
  WHERE id = v_list_id;

  RETURN NEW;
END;
$$;

-- Function to remove member from marketing list
CREATE OR REPLACE FUNCTION remove_member_from_marketing_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_club_id uuid;
BEGIN
  -- Get club_id and list_id from the old/deleted row
  v_club_id := COALESCE(OLD.club_id, NEW.club_id);

  SELECT id INTO v_list_id
  FROM marketing_subscriber_lists
  WHERE club_id = v_club_id
    AND list_type = 'all_members'
  LIMIT 1;

  IF v_list_id IS NOT NULL THEN
    -- Remove from list if archived or deleted
    IF (TG_OP = 'DELETE') OR (NEW.membership_status = 'archived') THEN
      DELETE FROM marketing_list_members
      WHERE list_id = v_list_id
        AND member_id = OLD.id;

      -- Update count
      UPDATE marketing_subscriber_lists
      SET subscriber_count = (
        SELECT COUNT(*) FROM marketing_list_members WHERE list_id = v_list_id
      )
      WHERE id = v_list_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS sync_member_to_marketing_on_insert ON members;
DROP TRIGGER IF EXISTS sync_member_to_marketing_on_update ON members;
DROP TRIGGER IF EXISTS remove_member_from_marketing_on_delete ON members;

-- Create triggers
CREATE TRIGGER sync_member_to_marketing_on_insert
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_to_marketing_list();

CREATE TRIGGER sync_member_to_marketing_on_update
  AFTER UPDATE OF email, first_name, last_name, membership_status ON members
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_to_marketing_list();

CREATE TRIGGER remove_member_from_marketing_on_delete
  AFTER DELETE ON members
  FOR EACH ROW
  EXECUTE FUNCTION remove_member_from_marketing_list();

-- Backfill existing clubs with "All Members" lists
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN SELECT id FROM clubs
  LOOP
    PERFORM ensure_all_members_list(club_record.id);
  END LOOP;
END $$;
