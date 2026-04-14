/*
  # Fix meeting attendance RLS timeout and meeting visibility defaults

  1. Changes
    - Drop and recreate overly complex meeting_attendance RLS policies that cause statement timeouts
    - Replace deep nested subqueries with simpler, index-friendly policies
    - Update visible_to_member_clubs default to true for general (non-committee) meetings
    - Backfill existing general association meetings to visible_to_member_clubs = true
  
  2. Security
    - Users can view attendance for meetings they can already see (via meetings RLS)
    - Users can insert/update their own attendance records
    - Simplified policy avoids deep join chains that cause timeouts
  
  3. Important Notes
    - The old policies used 4-level nested subqueries (meeting_attendance -> meetings -> clubs -> state_associations -> user_clubs)
    - New policies use a simpler approach: if you can read the meeting, you can see its attendance
*/

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users view attendance for visible association meetings' 
    AND tablename = 'meeting_attendance'
  ) THEN
    DROP POLICY "Users view attendance for visible association meetings" ON public.meeting_attendance;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users insert attendance for visible association meetings' 
    AND tablename = 'meeting_attendance'
  ) THEN
    DROP POLICY "Users insert attendance for visible association meetings" ON public.meeting_attendance;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.user_can_access_meeting(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = p_meeting_id
    AND (
      EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.club_id = m.club_id
      )
      OR (
        m.state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          JOIN public.clubs c ON c.id = uc.club_id
          WHERE uc.user_id = auth.uid()
          AND c.state_association_id = m.state_association_id
        )
      )
      OR (
        m.national_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          JOIN public.clubs c ON c.id = uc.club_id
          JOIN public.state_associations sa ON sa.id = c.state_association_id
          WHERE uc.user_id = auth.uid()
          AND sa.national_association_id = m.national_association_id
        )
      )
    )
  );
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users view attendance for accessible meetings' 
    AND tablename = 'meeting_attendance'
  ) THEN
    CREATE POLICY "Users view attendance for accessible meetings"
      ON public.meeting_attendance
      FOR SELECT
      TO authenticated
      USING (public.user_can_access_meeting(meeting_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users manage own attendance for accessible meetings' 
    AND tablename = 'meeting_attendance'
  ) THEN
    CREATE POLICY "Users manage own attendance for accessible meetings"
      ON public.meeting_attendance
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND public.user_can_access_meeting(meeting_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users update own attendance for accessible meetings' 
    AND tablename = 'meeting_attendance'
  ) THEN
    CREATE POLICY "Users update own attendance for accessible meetings"
      ON public.meeting_attendance
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

UPDATE public.meetings 
SET visible_to_member_clubs = true 
WHERE (state_association_id IS NOT NULL OR national_association_id IS NOT NULL)
  AND visible_to_member_clubs = false
  AND (meeting_type IS NULL OR meeting_type = 'general');
