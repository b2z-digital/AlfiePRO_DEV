/*
  # Fix Club Members subscriber list and RLS policies

  1. Changes
    - Renames "All Members" lists to "Club Members"
    - Adds super admin (platform-level) access to marketing_subscriber_lists
    - Adds super admin access to marketing_list_members
    - Updates ensure_all_members_list function to use "Club Members" name
    - Ensures every club has a "Club Members" list
  
  2. Security
    - Platform super admins can now view and manage all subscriber lists
    - Club admins retain existing access
    - Regular club members can view lists for their club
*/

-- Rename existing "All Members" lists to "Club Members"
UPDATE marketing_subscriber_lists 
SET name = 'Club Members' 
WHERE list_type = 'all_members' AND name = 'All Members';

-- Add super admin SELECT policy for marketing_subscriber_lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_subscriber_lists' 
    AND policyname = 'Super admins can view all subscriber lists'
  ) THEN
    CREATE POLICY "Super admins can view all subscriber lists"
      ON marketing_subscriber_lists FOR SELECT
      TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Add super admin INSERT policy for marketing_subscriber_lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_subscriber_lists' 
    AND policyname = 'Super admins can create subscriber lists'
  ) THEN
    CREATE POLICY "Super admins can create subscriber lists"
      ON marketing_subscriber_lists FOR INSERT
      TO authenticated
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Add super admin UPDATE policy for marketing_subscriber_lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_subscriber_lists' 
    AND policyname = 'Super admins can update subscriber lists'
  ) THEN
    CREATE POLICY "Super admins can update subscriber lists"
      ON marketing_subscriber_lists FOR UPDATE
      TO authenticated
      USING (public.is_super_admin(auth.uid()))
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Add super admin DELETE policy for marketing_subscriber_lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_subscriber_lists' 
    AND policyname = 'Super admins can delete subscriber lists'
  ) THEN
    CREATE POLICY "Super admins can delete subscriber lists"
      ON marketing_subscriber_lists FOR DELETE
      TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Add super admin policies for marketing_list_members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_list_members' 
    AND policyname = 'Super admins can view all list members'
  ) THEN
    CREATE POLICY "Super admins can view all list members"
      ON marketing_list_members FOR SELECT
      TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_list_members' 
    AND policyname = 'Super admins can manage list members'
  ) THEN
    CREATE POLICY "Super admins can manage list members"
      ON marketing_list_members FOR INSERT
      TO authenticated
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_list_members' 
    AND policyname = 'Super admins can update list members'
  ) THEN
    CREATE POLICY "Super admins can update list members"
      ON marketing_list_members FOR UPDATE
      TO authenticated
      USING (public.is_super_admin(auth.uid()))
      WITH CHECK (public.is_super_admin(auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'marketing_list_members' 
    AND policyname = 'Super admins can delete list members'
  ) THEN
    CREATE POLICY "Super admins can delete list members"
      ON marketing_list_members FOR DELETE
      TO authenticated
      USING (public.is_super_admin(auth.uid()));
  END IF;
END $$;

-- Update the ensure_all_members_list function to use "Club Members" name
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
    VALUES ('Club Members', 'Automatically synced list of all club members', p_club_id, 'all_members', 0, 0)
    RETURNING id INTO v_list_id;

    FOR v_member IN
      SELECT id, email, first_name, last_name
      FROM members
      WHERE club_id = p_club_id
        AND email IS NOT NULL
        AND email != ''
        AND (membership_status IS NULL OR membership_status != 'archived')
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

-- Create/ensure Club Members lists for all clubs that don't have one
DO $$
DECLARE
  v_club record;
BEGIN
  FOR v_club IN
    SELECT id FROM clubs
    WHERE id NOT IN (
      SELECT club_id FROM marketing_subscriber_lists WHERE list_type = 'all_members' AND club_id IS NOT NULL
    )
  LOOP
    PERFORM ensure_all_members_list(v_club.id);
  END LOOP;
END $$;

-- Update sync trigger to use "Club Members" name
CREATE OR REPLACE FUNCTION public.sync_member_to_marketing_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.membership_status = 'archived' THEN
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

NOTIFY pgrst, 'reload schema';