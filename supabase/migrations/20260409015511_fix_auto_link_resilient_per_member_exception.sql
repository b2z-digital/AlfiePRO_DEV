/*
  # Fix auto-link member on signup - resilient per-member exception handling

  1. Changes
    - Rewrites `auto_link_user_to_members` trigger function with per-member BEGIN/EXCEPTION blocks
      so that if one member's cascading triggers fail, other members can still be linked
    - Sets `onboarding_completed = true` on the profile when members are successfully linked
    - Rewrites `try_link_current_user_to_members` RPC with the same per-member resilience
    - Both functions now set `onboarding_completed = true` after successful linking

  2. Why
    - When `UPDATE members SET user_id = ...` fires, cascading triggers run
      (sync_member_to_club_membership, sync_profile_from_member, create_remittance, etc.)
    - If ANY of these cascade triggers error, the entire link operation was rolling back silently
    - This left users with no club associations and stuck on the onboarding screen
    - The fix wraps each individual member link in its own savepoint so failures are isolated

  3. Security
    - No RLS changes
    - Functions retain existing SECURITY DEFINER where applicable
*/

-- Fix the auth trigger function
CREATE OR REPLACE FUNCTION public.auto_link_user_to_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_linked_count int := 0;
  v_highest_access text;
  v_profile_exists boolean;
  v_link_error text;
BEGIN
  BEGIN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
      INSERT INTO public.profiles (id, first_name, last_name, onboarding_completed, created_at, updated_at)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        false,
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;

    FOR v_member IN
      SELECT id, club_id, first_name, last_name, avatar_url
      FROM public.members
      WHERE LOWER(email) = LOWER(NEW.email)
        AND user_id IS NULL
    LOOP
      BEGIN
        UPDATE public.members
        SET user_id = NEW.id
        WHERE id = v_member.id;

        INSERT INTO public.user_clubs (user_id, club_id, role)
        VALUES (NEW.id, v_member.club_id, 'member')
        ON CONFLICT (user_id, club_id) DO NOTHING;

        SELECT
          CASE
            WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
            WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
            ELSE NULL
          END INTO v_highest_access
        FROM public.committee_positions cp
        JOIN public.committee_position_definitions cpd ON cpd.id = cp.position_definition_id
        WHERE cp.member_id = v_member.id
          AND cp.club_id = v_member.club_id
          AND cpd.access_level IS NOT NULL;

        IF v_highest_access IS NOT NULL THEN
          UPDATE public.user_clubs
          SET role = v_highest_access
          WHERE user_id = NEW.id
            AND club_id = v_member.club_id;
        END IF;

        v_linked_count := v_linked_count + 1;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_link_error = MESSAGE_TEXT;
        RAISE WARNING 'auto_link_user_to_members: Failed to link member % in club %: %',
          v_member.id, v_member.club_id, v_link_error;
      END;
    END LOOP;

    IF v_linked_count > 0 THEN
      UPDATE public.profiles
      SET
        first_name = COALESCE(NULLIF((SELECT first_name FROM public.members WHERE LOWER(email) = LOWER(NEW.email) AND user_id = NEW.id LIMIT 1), ''), profiles.first_name),
        last_name = COALESCE(NULLIF((SELECT last_name FROM public.members WHERE LOWER(email) = LOWER(NEW.email) AND user_id = NEW.id LIMIT 1), ''), profiles.last_name),
        onboarding_completed = true,
        updated_at = now()
      WHERE id = NEW.id;

      RAISE LOG 'auto_link_user_to_members: Linked user % to % member record(s)', NEW.id, v_linked_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_link_user_to_members: Outer error for user %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;


-- Fix the frontend fallback RPC function
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
  v_highest_access text;
  v_effective_role text;
  v_link_error text;
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
    BEGIN
      UPDATE public.members SET user_id = v_user_id WHERE id = v_member.id;

      INSERT INTO public.user_clubs (user_id, club_id, role)
      VALUES (v_user_id, v_member.club_id, 'member')
      ON CONFLICT (user_id, club_id) DO NOTHING;

      SELECT
        CASE
          WHEN bool_or(cpd.access_level = 'admin') THEN 'admin'
          WHEN bool_or(cpd.access_level = 'editor') THEN 'editor'
          ELSE NULL
        END INTO v_highest_access
      FROM public.committee_positions cp
      JOIN public.committee_position_definitions cpd ON cpd.id = cp.position_definition_id
      WHERE cp.member_id = v_member.id
        AND cp.club_id = v_member.club_id
        AND cpd.access_level IS NOT NULL;

      v_effective_role := 'member';
      IF v_highest_access IS NOT NULL THEN
        UPDATE public.user_clubs
        SET role = v_highest_access
        WHERE user_id = v_user_id
          AND club_id = v_member.club_id;
        v_effective_role := v_highest_access;
      END IF;

      v_linked_clubs := v_linked_clubs || jsonb_build_object(
        'club_id', v_member.club_id,
        'club_name', v_member.club_name,
        'club_abbreviation', v_member.abbreviation,
        'role', v_effective_role,
        'club_logo', v_member.logo
      );

      v_linked_count := v_linked_count + 1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_link_error = MESSAGE_TEXT;
      RAISE WARNING 'try_link_current_user_to_members: Failed to link member % in club %: %',
        v_member.id, v_member.club_id, v_link_error;
    END;
  END LOOP;

  IF v_linked_count > 0 THEN
    UPDATE public.profiles
    SET
      first_name = COALESCE(NULLIF((SELECT first_name FROM public.members WHERE user_id = v_user_id LIMIT 1), ''), profiles.first_name),
      last_name = COALESCE(NULLIF((SELECT last_name FROM public.members WHERE user_id = v_user_id LIMIT 1), ''), profiles.last_name),
      onboarding_completed = true,
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
