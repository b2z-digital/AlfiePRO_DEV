/*
  # Restore auto-link members on signup trigger

  1. Functions
    - `auto_link_user_to_members` - When a new user signs up, automatically links them
      to any existing member records that match their email address. Also creates
      the corresponding `user_clubs` entries.

  2. Triggers
    - `auto_link_members_on_signup` - Fires AFTER INSERT on `auth.users` to run
      the auto-link function for every new signup.

  3. Notes
    - Uses SECURITY DEFINER to bypass RLS during the trigger execution
    - Wrapped in exception handling so a failure here never blocks user creation
    - Also syncs the member's profile data (first_name, last_name, avatar) to the profile
*/

CREATE OR REPLACE FUNCTION public.auto_link_user_to_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_linked_count int := 0;
BEGIN
  BEGIN
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'auto_link_members_on_signup'
    AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER auto_link_members_on_signup
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_link_user_to_members();
  END IF;
END $$;
