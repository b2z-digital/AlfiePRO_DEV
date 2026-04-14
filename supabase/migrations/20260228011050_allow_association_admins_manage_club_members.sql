/*
  # Allow Association Admins to Manage Club Members

  1. Security Changes
    - Add INSERT policy for state admins to add members to clubs under their association
    - Add UPDATE policy for state admins to update members in clubs under their association
    - Add INSERT policy for national admins to add members to clubs under their association
    - Add UPDATE policy for national admins to update members in clubs under their association

  2. Important Notes
    - State admins can manage members in any club that belongs to their state association
    - National admins can manage members in any club under any state in their national association
    - This enables association admins to use the club-level CSV import for clubs under their jurisdiction
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'State admins can insert club members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "State admins can insert club members"
      ON public.members
      FOR INSERT
      TO authenticated
      WITH CHECK (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.user_state_associations usa ON usa.state_association_id = c.state_association_id
          WHERE c.id = members.club_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'State admins can update club members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "State admins can update club members"
      ON public.members
      FOR UPDATE
      TO authenticated
      USING (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.user_state_associations usa ON usa.state_association_id = c.state_association_id
          WHERE c.id = members.club_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      )
      WITH CHECK (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.user_state_associations usa ON usa.state_association_id = c.state_association_id
          WHERE c.id = members.club_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'National admins can insert club members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "National admins can insert club members"
      ON public.members
      FOR INSERT
      TO authenticated
      WITH CHECK (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.state_associations sa ON sa.id = c.state_association_id
          JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE c.id = members.club_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'National admins can update club members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "National admins can update club members"
      ON public.members
      FOR UPDATE
      TO authenticated
      USING (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.state_associations sa ON sa.id = c.state_association_id
          JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE c.id = members.club_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      )
      WITH CHECK (
        club_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clubs c
          JOIN public.state_associations sa ON sa.id = c.state_association_id
          JOIN public.user_national_associations una ON una.national_association_id = sa.national_association_id
          WHERE c.id = members.club_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      );
  END IF;
END $$;
