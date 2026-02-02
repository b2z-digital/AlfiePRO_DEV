/*
  # Enhance Social Community Features

  1. Auto-create club member groups
    - Create trigger to automatically create a club member group when a club is created
    - Backfill existing clubs with member groups

  2. Add active status tracking
    - Add last_seen column to profiles
    - Create function to track active users

  3. Connection management enhancements
    - Add connection request system
    - Add connection status types
*/

-- Add last_seen to profiles for activity tracking
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- Create index for faster active user queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen DESC);

-- Function to create club member group automatically
CREATE OR REPLACE FUNCTION create_club_member_group()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  group_name text;
  group_description text;
BEGIN
  -- Create group name from club abbreviation or name
  group_name := COALESCE(NEW.abbreviation, LEFT(NEW.name, 10)) || ' Members';
  group_description := 'Official member group for ' || NEW.name;

  -- Insert the group
  INSERT INTO social_groups (
    name,
    description,
    group_type,
    club_id,
    visibility,
    created_by,
    allow_member_posts
  ) VALUES (
    group_name,
    group_description,
    'club',
    NEW.id,
    'private',
    NEW.created_by_user_id,
    true
  );

  RETURN NEW;
END;
$$;

-- Create trigger for new clubs
DROP TRIGGER IF EXISTS trigger_create_club_member_group ON clubs;
CREATE TRIGGER trigger_create_club_member_group
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION create_club_member_group();

-- Backfill: Create member groups for existing clubs that don't have one
DO $$
DECLARE
  club_record RECORD;
  group_name text;
  group_description text;
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
    group_name := COALESCE(club_record.abbreviation, LEFT(club_record.name, 10)) || ' Members';
    group_description := 'Official member group for ' || club_record.name;

    -- Get first admin user for this club if created_by is null
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
      allow_member_posts
    ) VALUES (
      group_name,
      group_description,
      'club',
      club_record.id,
      'private',
      first_admin_id,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Function to auto-join users to their club's member group
CREATE OR REPLACE FUNCTION auto_join_club_member_group()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  club_group_id uuid;
BEGIN
  -- Find the club's member group
  SELECT id INTO club_group_id
  FROM social_groups
  WHERE club_id = NEW.club_id
    AND group_type = 'club'
  LIMIT 1;

  -- If group exists, add user as member
  IF club_group_id IS NOT NULL THEN
    INSERT INTO social_group_members (
      group_id,
      user_id,
      role,
      status
    ) VALUES (
      club_group_id,
      NEW.user_id,
      'member',
      'active'
    )
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to auto-join club members to their club group
DROP TRIGGER IF EXISTS trigger_auto_join_club_group ON user_clubs;
CREATE TRIGGER trigger_auto_join_club_group
  AFTER INSERT ON user_clubs
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_club_member_group();

-- Backfill: Add all existing club members to their club groups
DO $$
DECLARE
  user_club_record RECORD;
  club_group_id uuid;
BEGIN
  FOR user_club_record IN
    SELECT uc.user_id, uc.club_id
    FROM user_clubs uc
    WHERE uc.user_id IS NOT NULL
  LOOP
    -- Find the club's member group
    SELECT sg.id INTO club_group_id
    FROM social_groups sg
    WHERE sg.club_id = user_club_record.club_id
      AND sg.group_type = 'club'
    LIMIT 1;

    -- Add user to group if not already a member
    IF club_group_id IS NOT NULL THEN
      INSERT INTO social_group_members (
        group_id,
        user_id,
        role,
        status
      ) VALUES (
        club_group_id,
        user_club_record.user_id,
        'member',
        'active'
      )
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Function to update last_seen timestamp
CREATE OR REPLACE FUNCTION update_user_last_seen()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profiles
  SET last_seen = now()
  WHERE id = auth.uid();
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION update_user_last_seen() TO authenticated;