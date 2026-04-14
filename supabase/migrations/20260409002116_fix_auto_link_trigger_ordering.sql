/*
  # Fix auto-link trigger execution order

  The `auto_link_members_on_signup` trigger was running BEFORE `on_auth_user_created` 
  (alphabetical order in PostgreSQL). This caused the auto-link to fail because:
  
  1. auto_link updates members.user_id
  2. This cascades to sync_member_to_club_membership trigger
  3. Which tries to INSERT into club_memberships with FK to profiles(id)
  4. But the profile doesn't exist yet (on_auth_user_created hasn't run)
  5. FK violation is caught by exception handler and silently swallowed

  ## Fix
  - Drop the old trigger `auto_link_members_on_signup`
  - Create new trigger `zz_auto_link_members_on_signup` so it runs AFTER `on_auth_user_created`
  - Also add a safety check in the function to ensure profile exists before proceeding
*/

-- Drop the old trigger
DROP TRIGGER IF EXISTS auto_link_members_on_signup ON auth.users;

-- Update the function to ensure profile exists before linking
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
    END LOOP;

    IF v_linked_count > 0 THEN
      UPDATE public.profiles
      SET
        first_name = COALESCE(NULLIF((SELECT first_name FROM public.members WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1), ''), profiles.first_name),
        last_name = COALESCE(NULLIF((SELECT last_name FROM public.members WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1), ''), profiles.last_name),
        updated_at = now()
      WHERE id = NEW.id;

      RAISE LOG 'auto_link_user_to_members: Linked user % to % member record(s)', NEW.id, v_linked_count;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'auto_link_user_to_members: Error linking user %: % (SQLSTATE: %)',
        NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Create new trigger with name that sorts AFTER on_auth_user_created
CREATE TRIGGER zz_auto_link_members_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_user_to_members();
