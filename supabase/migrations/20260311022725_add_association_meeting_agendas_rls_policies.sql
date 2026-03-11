/*
  # Add association-level RLS policies for meeting_agendas

  1. Changes
    - Add SELECT, INSERT, UPDATE, DELETE policies for state association admins on meeting_agendas
    - Add SELECT, INSERT, UPDATE, DELETE policies for national association admins on meeting_agendas
    - Policies check membership through the parent meeting's state_association_id or national_association_id

  2. Security
    - State admins can manage agendas for meetings belonging to their state association
    - National admins can manage agendas for meetings belonging to their national association
    - All state/national association users can view agendas for their association meetings
*/

-- State association: view meeting agendas
CREATE POLICY "State association users can view meeting agendas"
  ON public.meeting_agendas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_state_associations usa ON usa.state_association_id = m.state_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.state_association_id IS NOT NULL
        AND usa.user_id = auth.uid()
    )
  );

-- State association: insert meeting agendas
CREATE POLICY "State admins can add meeting agendas"
  ON public.meeting_agendas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_state_associations usa ON usa.state_association_id = m.state_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.state_association_id IS NOT NULL
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
  );

-- State association: update meeting agendas
CREATE POLICY "State admins can update meeting agendas"
  ON public.meeting_agendas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_state_associations usa ON usa.state_association_id = m.state_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.state_association_id IS NOT NULL
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_state_associations usa ON usa.state_association_id = m.state_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.state_association_id IS NOT NULL
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
  );

-- State association: delete meeting agendas
CREATE POLICY "State admins can delete meeting agendas"
  ON public.meeting_agendas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_state_associations usa ON usa.state_association_id = m.state_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.state_association_id IS NOT NULL
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
  );

-- National association: view meeting agendas
CREATE POLICY "National association users can view meeting agendas"
  ON public.meeting_agendas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_national_associations una ON una.national_association_id = m.national_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.national_association_id IS NOT NULL
        AND una.user_id = auth.uid()
    )
  );

-- National association: insert meeting agendas
CREATE POLICY "National admins can add meeting agendas"
  ON public.meeting_agendas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_national_associations una ON una.national_association_id = m.national_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.national_association_id IS NOT NULL
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
  );

-- National association: update meeting agendas
CREATE POLICY "National admins can update meeting agendas"
  ON public.meeting_agendas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_national_associations una ON una.national_association_id = m.national_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.national_association_id IS NOT NULL
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_national_associations una ON una.national_association_id = m.national_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.national_association_id IS NOT NULL
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
  );

-- National association: delete meeting agendas
CREATE POLICY "National admins can delete meeting agendas"
  ON public.meeting_agendas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      JOIN public.user_national_associations una ON una.national_association_id = m.national_association_id
      WHERE m.id = meeting_agendas.meeting_id
        AND m.national_association_id IS NOT NULL
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
  );
