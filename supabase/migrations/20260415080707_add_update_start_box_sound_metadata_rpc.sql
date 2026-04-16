/*
  # Add RPC to update sound metadata (name/description)

  1. New Function
    - `update_start_box_sound_metadata` - Security definer function to update name/description
      with explicit permission checks (same pattern as replace_start_box_sound_file)

  2. Why
    - Direct UPDATE via RLS silently returns 0 rows when permissions aren't met,
      making edits appear to save but revert on reload
*/

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
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = v_user_id
      AND user_clubs.role = 'super_admin'
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied. You need admin access to edit this sound.');
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
