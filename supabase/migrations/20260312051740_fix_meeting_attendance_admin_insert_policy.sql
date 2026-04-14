/*
  # Fix meeting attendance admin insert policy

  ## Problem
  When a club/association admin sends meeting invites, they insert attendance records
  on behalf of all recipients. The existing INSERT policy only allows users to insert
  their OWN attendance record (auth.uid() = user_id), which blocks admins from
  creating records for other members.

  ## Fix
  Add a helper function user_is_meeting_admin() and new INSERT/UPDATE policies
  that allow club admins, association admins, and super admins to manage attendance
  records for meetings they own/administer.

  ## Role values from club_role enum:
  admin, editor, super_admin, national_admin, state_admin, pro, member
*/

CREATE OR REPLACE FUNCTION public.user_is_meeting_admin(p_meeting_id uuid)
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
      -- Club admin/editor for the meeting's club
      (m.club_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.club_id = m.club_id
        AND uc.role IN ('admin', 'editor', 'super_admin')
      ))
      OR
      -- State association admin (via user_clubs with state_admin role in any club of that state association)
      (m.state_association_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_clubs uc
        JOIN public.clubs c ON c.id = uc.club_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('state_admin', 'super_admin')
        AND c.state_association_id = m.state_association_id
      ))
      OR
      -- National association admin
      (m.national_association_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_clubs uc
        JOIN public.clubs c ON c.id = uc.club_id
        JOIN public.state_associations sa ON sa.id = c.state_association_id
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('national_admin', 'super_admin')
        AND sa.national_association_id = m.national_association_id
      ))
      OR
      -- Platform super admin
      EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role = 'super_admin'
      )
    )
  );
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admins can insert attendance records for their meetings'
    AND tablename = 'meeting_attendance'
  ) THEN
    CREATE POLICY "Admins can insert attendance records for their meetings"
      ON public.meeting_attendance
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.user_is_meeting_admin(meeting_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admins can update attendance records for their meetings'
    AND tablename = 'meeting_attendance'
  ) THEN
    CREATE POLICY "Admins can update attendance records for their meetings"
      ON public.meeting_attendance
      FOR UPDATE
      TO authenticated
      USING (public.user_is_meeting_admin(meeting_id))
      WITH CHECK (public.user_is_meeting_admin(meeting_id));
  END IF;
END $$;
