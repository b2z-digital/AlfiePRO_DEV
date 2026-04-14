/*
  # Fix alfie-knowledge storage policies with correct table names

  1. Changes
    - Drop incorrect storage policies
    - Recreate using profiles.is_super_admin and correct association tables
    - Fix knowledge documents management policy

  2. Security
    - Super admins, club admins, and association admins can manage files
    - Authenticated users retain read access
*/

DROP POLICY IF EXISTS "Super and national admins can upload alfie knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Super and national admins can update alfie knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Super and national admins can delete alfie knowledge files" ON storage.objects;

CREATE POLICY "Admins can upload alfie knowledge files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'alfie-knowledge'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
      OR EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('admin')
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
  );

CREATE POLICY "Admins can update alfie knowledge files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'alfie-knowledge'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
      OR EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('admin')
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
  )
  WITH CHECK (
    bucket_id = 'alfie-knowledge'
  );

CREATE POLICY "Admins can delete alfie knowledge files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'alfie-knowledge'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.is_super_admin = true
      )
      OR EXISTS (
        SELECT 1 FROM public.user_clubs uc
        WHERE uc.user_id = auth.uid()
        AND uc.role IN ('admin')
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
  );

DROP POLICY IF EXISTS "Super and national admins can manage knowledge documents" ON alfie_knowledge_documents;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'alfie_knowledge_documents' 
    AND policyname = 'Admins can manage knowledge documents'
  ) THEN
    CREATE POLICY "Admins can manage knowledge documents"
      ON alfie_knowledge_documents FOR ALL
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
          AND uc.role IN ('admin')
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
          AND uc.role IN ('admin')
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
