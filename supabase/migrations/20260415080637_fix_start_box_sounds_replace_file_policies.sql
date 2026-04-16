/*
  # Fix Start Box Sound File Replacement

  1. Storage Changes
    - Add UPDATE policy for `start-box-sounds` storage bucket so authenticated users
      can update (overwrite) objects

  2. Database Changes
    - Create `replace_start_box_sound_file` RPC function (security definer) that allows
      admins (club admins for club sounds, super admins for system sounds) to update
      the file fields on a sound record
    - This bypasses RLS while still doing proper permission checks internally

  3. Why
    - The existing RLS UPDATE policy on `start_box_sounds` silently returns 0 rows 
      when conditions aren't met, causing the replace operation to appear to succeed 
      but revert on reload
    - A security definer function gives explicit error messages on permission failure
*/

-- Add UPDATE policy for storage objects in start-box-sounds bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can update start box sounds' 
    AND tablename = 'objects' 
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated users can update start box sounds"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'start-box-sounds')
      WITH CHECK (bucket_id = 'start-box-sounds');
  END IF;
END $$;

-- Create RPC function to replace sound file with proper permission checks
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
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = v_user_id
      AND user_clubs.role = 'super_admin'
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RETURN json_build_object('success', false, 'error', 'Permission denied. You need admin access to replace this sound file.');
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
