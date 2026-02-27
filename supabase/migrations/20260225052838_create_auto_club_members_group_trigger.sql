/*
  # Auto-create Members group for new clubs

  1. New Function
    - `auto_create_club_members_group()` - Trigger function that creates a Members group
      when a new club is inserted into the `clubs` table
    - Automatically names the group using the club's abbreviation or first 10 chars of name
    - Sets group_type to 'club', visibility to 'private', allows member posts

  2. New Trigger
    - `trigger_auto_create_club_members_group` on `clubs` table (AFTER INSERT)
    - Ensures every new club gets a default Members group

  3. Backfill
    - Creates Members groups for any existing clubs that don't have one
    - Adds all existing club members (from user_clubs) to their club's Members group

  4. Notes
    - This complements the existing `auto_join_club_member_group` trigger on `user_clubs`
      which auto-adds new members to the club's group
    - Default club groups (group_type='club') are protected from deletion in the UI
*/

-- Function to auto-create a Members group when a new club is created
CREATE OR REPLACE FUNCTION auto_create_club_members_group()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  group_name text;
  group_description text;
  new_group_id uuid;
BEGIN
  -- Check if this club already has a members group
  IF EXISTS (
    SELECT 1 FROM social_groups
    WHERE club_id = NEW.id AND group_type = 'club'
  ) THEN
    RETURN NEW;
  END IF;

  group_name := COALESCE(NEW.abbreviation, LEFT(NEW.name, 10)) || ' Members';
  group_description := 'Official member group for ' || NEW.name;

  INSERT INTO social_groups (
    name,
    description,
    group_type,
    club_id,
    visibility,
    created_by,
    allow_member_posts,
    member_count
  ) VALUES (
    group_name,
    group_description,
    'club',
    NEW.id,
    'private',
    NEW.created_by_user_id,
    true,
    0
  )
  RETURNING id INTO new_group_id;

  -- If the club creator exists, add them as admin of the group
  IF NEW.created_by_user_id IS NOT NULL AND new_group_id IS NOT NULL THEN
    INSERT INTO social_group_members (
      group_id,
      user_id,
      role,
      status
    ) VALUES (
      new_group_id,
      NEW.created_by_user_id,
      'admin',
      'active'
    )
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on clubs table
DROP TRIGGER IF EXISTS trigger_auto_create_club_members_group ON clubs;
CREATE TRIGGER trigger_auto_create_club_members_group
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_club_members_group();

-- Backfill: Create Members groups for any existing clubs missing one
DO $$
DECLARE
  club_record RECORD;
  new_group_id uuid;
  first_admin_id uuid;
BEGIN
  FOR club_record IN
    SELECT c.id, c.name, c.abbreviation, c.created_by_user_id
    FROM clubs c
    WHERE NOT EXISTS (
      SELECT 1 FROM social_groups sg
      WHERE sg.club_id = c.id AND sg.group_type = 'club'
    )
  LOOP
    first_admin_id := club_record.created_by_user_id;
    IF first_admin_id IS NULL THEN
      SELECT user_id INTO first_admin_id
      FROM user_clubs
      WHERE club_id = club_record.id AND role = 'admin'
      LIMIT 1;
    END IF;

    INSERT INTO social_groups (
      name,
      description,
      group_type,
      club_id,
      visibility,
      created_by,
      allow_member_posts,
      member_count
    ) VALUES (
      COALESCE(club_record.abbreviation, LEFT(club_record.name, 10)) || ' Members',
      'Official member group for ' || club_record.name,
      'club',
      club_record.id,
      'private',
      first_admin_id,
      true,
      0
    )
    RETURNING id INTO new_group_id;

    -- Add the admin as group admin
    IF first_admin_id IS NOT NULL AND new_group_id IS NOT NULL THEN
      INSERT INTO social_group_members (
        group_id,
        user_id,
        role,
        status
      ) VALUES (
        new_group_id,
        first_admin_id,
        'admin',
        'active'
      )
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Backfill: Add all existing club members to their club's Members group
DO $$
DECLARE
  uc_record RECORD;
  club_group_id uuid;
BEGIN
  FOR uc_record IN
    SELECT uc.user_id, uc.club_id
    FROM user_clubs uc
    WHERE uc.user_id IS NOT NULL
  LOOP
    SELECT sg.id INTO club_group_id
    FROM social_groups sg
    WHERE sg.club_id = uc_record.club_id
      AND sg.group_type = 'club'
    LIMIT 1;

    IF club_group_id IS NOT NULL THEN
      INSERT INTO social_group_members (
        group_id,
        user_id,
        role,
        status
      ) VALUES (
        club_group_id,
        uc_record.user_id,
        'member',
        'active'
      )
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Update member_count for all club groups to reflect actual membership
UPDATE social_groups sg
SET member_count = (
  SELECT COUNT(*)
  FROM social_group_members sgm
  WHERE sgm.group_id = sg.id AND sgm.status = 'active'
)
WHERE sg.group_type = 'club';
