/*
  # Add Association Support to Members Table

  1. New Columns
    - `members.state_association_id` (uuid, nullable) - Links member to a state association for association-level imports
    - `members.national_association_id` (uuid, nullable) - Links member to a national association for association-level imports

  2. Security
    - New INSERT policy for state association admins to create members with their state_association_id
    - New UPDATE policy for state association admins to update members in their association
    - New INSERT policy for national association admins to create members with their national_association_id
    - New UPDATE policy for national association admins to update members in their association

  3. Important Notes
    - Members can belong to either a club (club_id) or an association (state/national_association_id) or both
    - Association imports create members without a club_id, which clubs can later claim
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'state_association_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.members ADD COLUMN state_association_id uuid REFERENCES public.state_associations(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'national_association_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.members ADD COLUMN national_association_id uuid REFERENCES public.national_associations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_state_association_id ON public.members(state_association_id) WHERE state_association_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_national_association_id ON public.members(national_association_id) WHERE national_association_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'State admins can insert association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "State admins can insert association members"
      ON public.members
      FOR INSERT
      TO authenticated
      WITH CHECK (
        state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = members.state_association_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'State admins can update association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "State admins can update association members"
      ON public.members
      FOR UPDATE
      TO authenticated
      USING (
        state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = members.state_association_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      )
      WITH CHECK (
        state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = members.state_association_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'National admins can insert association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "National admins can insert association members"
      ON public.members
      FOR INSERT
      TO authenticated
      WITH CHECK (
        national_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = members.national_association_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'National admins can update association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "National admins can update association members"
      ON public.members
      FOR UPDATE
      TO authenticated
      USING (
        national_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = members.national_association_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      )
      WITH CHECK (
        national_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = members.national_association_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'State admins can view association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "State admins can view association members"
      ON public.members
      FOR SELECT
      TO authenticated
      USING (
        state_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.state_association_id = members.state_association_id
          AND usa.user_id = auth.uid()
          AND usa.role = 'state_admin'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'National admins can view national association members' AND polrelid = 'public.members'::regclass
  ) THEN
    CREATE POLICY "National admins can view national association members"
      ON public.members
      FOR SELECT
      TO authenticated
      USING (
        national_association_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.national_association_id = members.national_association_id
          AND una.user_id = auth.uid()
          AND una.role = 'national_admin'
        )
      );
  END IF;
END $$;
