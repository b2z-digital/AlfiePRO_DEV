/*
  # Add access_level to committee position definitions

  1. Changes
    - Add `access_level` column to `committee_position_definitions` table
      - Values: 'admin', 'editor', 'viewer'
      - Defaults: President, Vice President, Treasurer, Secretary -> 'admin'
      - All other positions -> 'editor'
    - This allows clubs to define what system access level each committee position grants
    - When a member is assigned to a committee position, their user_clubs role can be synced

  2. Trigger: sync_committee_access_level
    - On INSERT/DELETE in committee_positions
    - Determines the highest access level across all positions held by a member
    - Updates their user_clubs.role accordingly
    - Only applies if the member has a linked user account (user_id)

  3. Important Notes
    - Existing committee position holders will NOT have their roles changed automatically
    - Only new assignments going forward will trigger the sync
    - Association admins can override via direct role assignment
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_position_definitions' AND column_name = 'access_level'
  ) THEN
    ALTER TABLE committee_position_definitions
    ADD COLUMN access_level TEXT DEFAULT 'editor'
    CHECK (access_level IN ('admin', 'editor', 'viewer'));
  END IF;
END $$;

UPDATE committee_position_definitions
SET access_level = 'admin'
WHERE LOWER(position_name) IN ('president', 'vice president', 'treasurer', 'secretary')
  AND access_level IS DISTINCT FROM 'admin';

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

  IF v_member_id IS NULL THEN
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
      ELSE 'viewer'
    END INTO v_highest_access
  FROM committee_positions cp
  JOIN committee_position_definitions cpd ON cpd.id = cp.position_definition_id
  WHERE cp.member_id = v_member_id
    AND cp.club_id = v_club_id
    AND cpd.access_level IS NOT NULL;

  IF v_highest_access IS NULL THEN
    v_highest_access := 'viewer';
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

DROP TRIGGER IF EXISTS sync_committee_access_trigger ON committee_positions;

CREATE TRIGGER sync_committee_access_trigger
  AFTER INSERT OR DELETE ON committee_positions
  FOR EACH ROW
  EXECUTE FUNCTION sync_committee_access_to_user_clubs();
