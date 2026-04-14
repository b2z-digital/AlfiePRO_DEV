/*
  # Update user_is_meeting_admin to include editor role for associations

  Include 'editor' role for state/national associations so editors can also
  send meeting invites on behalf of their association.
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
      -- State association admin/editor
      (m.state_association_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_state_associations usa
        WHERE usa.user_id = auth.uid()
        AND usa.state_association_id = m.state_association_id
        AND usa.role IN ('state_admin', 'editor')
      ))
      OR
      -- National association admin/editor
      (m.national_association_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_national_associations una
        WHERE una.user_id = auth.uid()
        AND una.national_association_id = m.national_association_id
        AND una.role IN ('national_admin', 'editor')
      ))
      OR
      -- Platform super admin
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
    )
  );
$$;
