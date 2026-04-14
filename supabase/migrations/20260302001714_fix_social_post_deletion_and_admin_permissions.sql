/*
  # Fix Social Post Deletion and Add Admin Permissions

  1. Changes
    - Update DELETE policy on social_posts to allow:
      - Post authors to delete their own posts
      - Club admins to delete posts in their club's groups
      - Super admins to delete any post
    - Create an RPC function `delete_social_post` that performs the delete
      and returns whether it actually succeeded (to avoid silent failures)

  2. Security
    - DELETE policy expanded but still requires authenticated user
    - Super admin check via is_super_admin function
    - Club admin check via group membership with admin role
*/

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.social_posts;

-- Create a helper function to check if user is a club admin for a post's group
CREATE OR REPLACE FUNCTION is_club_admin_for_group_post(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM social_groups sg
    JOIN user_clubs uc ON uc.club_id = sg.club_id AND uc.user_id = p_user_id
    WHERE sg.id = p_group_id
    AND uc.role = 'admin'
  );
$$;

-- Create expanded DELETE policy
CREATE POLICY "Users and admins can delete posts"
  ON public.social_posts
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR is_super_admin(auth.uid())
    OR (group_id IS NOT NULL AND is_club_admin_for_group_post(group_id, auth.uid()))
  );

-- Create RPC function for reliable post deletion with success feedback
CREATE OR REPLACE FUNCTION delete_social_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author_id uuid;
  v_post_group_id uuid;
  v_current_user_id uuid;
  v_can_delete boolean := false;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT author_id, group_id INTO v_post_author_id, v_post_group_id
  FROM social_posts
  WHERE id = p_post_id;

  IF v_post_author_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_post_author_id = v_current_user_id THEN
    v_can_delete := true;
  END IF;

  IF NOT v_can_delete AND is_super_admin(v_current_user_id) THEN
    v_can_delete := true;
  END IF;

  IF NOT v_can_delete AND v_post_group_id IS NOT NULL AND is_club_admin_for_group_post(v_post_group_id, v_current_user_id) THEN
    v_can_delete := true;
  END IF;

  IF NOT v_can_delete THEN
    RAISE EXCEPTION 'You do not have permission to delete this post';
  END IF;

  DELETE FROM social_posts WHERE id = p_post_id;
  
  RETURN true;
END;
$$;
