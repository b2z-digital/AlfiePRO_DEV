/*
  # Create self-service member linking RPC

  1. Functions
    - `try_link_current_user_to_members` - Allows a newly signed-up user to link themselves
      to any existing member records matching their email. This serves as a frontend fallback
      if the database trigger fails to fire.

  2. Security
    - Uses SECURITY DEFINER so it can update members.user_id and insert into user_clubs
    - Only links members where user_id IS NULL (unlinked)
    - Only matches the calling user's own email from auth.users
    - Returns the list of linked clubs for display
*/

CREATE OR REPLACE FUNCTION public.try_link_current_user_to_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_member RECORD;
  v_linked_clubs jsonb := '[]'::jsonb;
  v_linked_count int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User email not found');
  END IF;

  FOR v_member IN
    SELECT m.id, m.club_id, m.first_name, m.last_name, c.name as club_name, c.abbreviation, c.logo
    FROM public.members m
    JOIN public.clubs c ON c.id = m.club_id
    WHERE LOWER(m.email) = LOWER(v_user_email)
      AND m.user_id IS NULL
      AND (c.approval_status IS NULL OR c.approval_status IN ('approved', 'active'))
  LOOP
    UPDATE public.members SET user_id = v_user_id WHERE id = v_member.id;

    INSERT INTO public.user_clubs (user_id, club_id, role)
    VALUES (v_user_id, v_member.club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;

    v_linked_clubs := v_linked_clubs || jsonb_build_object(
      'club_id', v_member.club_id,
      'club_name', v_member.club_name,
      'club_abbreviation', v_member.abbreviation,
      'role', 'member',
      'club_logo', v_member.logo
    );

    v_linked_count := v_linked_count + 1;
  END LOOP;

  IF v_linked_count > 0 THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(NULLIF((SELECT first_name FROM public.members WHERE user_id = v_user_id LIMIT 1), ''), profiles.first_name),
      last_name = COALESCE(NULLIF((SELECT last_name FROM public.members WHERE user_id = v_user_id LIMIT 1), ''), profiles.last_name),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked_count,
    'clubs', v_linked_clubs
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
