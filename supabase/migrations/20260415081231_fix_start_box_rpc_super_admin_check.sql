/*
  # Fix Start Box RPC Super Admin Permission Check

  1. Problem
    - The `replace_start_box_sound_file` and `update_start_box_sound_metadata` RPCs
      only checked `user_clubs.role = 'super_admin'` to determine super admin status
    - Super admin status is actually stored in `profiles.is_super_admin` column
    - This caused super admins to be incorrectly denied permission to edit system sounds

  2. Fix
    - Updated both RPC functions to check `profiles.is_super_admin = true` OR
      `user_clubs.role = 'super_admin'` for system sound permissions
    - Club-level sound permissions remain unchanged (club admin check)
*/

CREATE OR REPLACE FUNCTION public.replace_start_box_sound_file(
  p_sound_id uuid,
  p_file_path text,
  p_file_url text,
  p_file_size integer,
  p_mime_type text,
  p_duration_ms integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sound RECORD;
  v_user_id uuid;
  v_has_permission boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_sound FROM public.start_box_sounds WHERE id = p_sound_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sound not found');
  END IF;

  IF v_sound.club_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = v_user_id
      AND user_clubs.club_id = v_sound.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_user_id AND is_super_admin = true
      ) INTO v_has_permission;
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND is_super_admin = true
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = v_user_id
        AND user_clubs.role = 'super_admin'
      ) INTO v_has_permission;
    END IF;
  END IF;

  IF NOT v_has_permission THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied. Only super admins can modify system sounds.');
  END IF;

  UPDATE public.start_box_sounds
  SET
    file_path = p_file_path,
    file_url = p_file_url,
    file_size = p_file_size,
    mime_type = p_mime_type,
    duration_ms = COALESCE(p_duration_ms, duration_ms),
    updated_at = now()
  WHERE id = p_sound_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_start_box_sound_metadata(
  p_sound_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sound RECORD;
  v_user_id uuid;
  v_has_permission boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_sound FROM public.start_box_sounds WHERE id = p_sound_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sound not found');
  END IF;

  IF v_sound.club_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = v_user_id
      AND user_clubs.club_id = v_sound.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_user_id AND is_super_admin = true
      ) INTO v_has_permission;
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND is_super_admin = true
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = v_user_id
        AND user_clubs.role = 'super_admin'
      ) INTO v_has_permission;
    END IF;
  END IF;

  IF NOT v_has_permission THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied. Only super admins can modify system sounds.');
  END IF;

  UPDATE public.start_box_sounds
  SET
    name = p_name,
    description = p_description,
    updated_at = now()
  WHERE id = p_sound_id;

  RETURN json_build_object('success', true);
END;
$$;
