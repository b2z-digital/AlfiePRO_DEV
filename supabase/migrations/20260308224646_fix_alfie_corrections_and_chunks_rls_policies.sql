/*
  # Fix alfie_knowledge_corrections and chunks RLS policies

  1. Changes
    - Drop corrections management policy that checks wrong role field
    - Recreate using profiles.is_super_admin check
    - Add management policy for chunks table so admins can insert/delete

  2. Security
    - Super admins, club admins, and association admins can manage
    - Authenticated users can still read active corrections and chunks
*/

DROP POLICY IF EXISTS "Super admins can manage corrections" ON alfie_knowledge_corrections;

CREATE POLICY "Admins can manage corrections"
  ON alfie_knowledge_corrections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'alfie_knowledge_chunks' 
    AND policyname = 'Admins can manage knowledge chunks'
  ) THEN
    CREATE POLICY "Admins can manage knowledge chunks"
      ON alfie_knowledge_chunks FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.is_super_admin = true
        )
        OR EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.user_id = auth.uid()
          AND usa.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.user_id = auth.uid()
          AND una.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.is_super_admin = true
        )
        OR EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.user_state_associations usa
          WHERE usa.user_id = auth.uid()
          AND usa.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM public.user_national_associations una
          WHERE una.user_id = auth.uid()
          AND una.role = 'admin'
        )
      );
  END IF;
END $$;
