/*
  # Fix alfie-knowledge storage bucket upload policies

  1. Changes
    - Add INSERT policy for super_admin and national_admin users to upload files
    - Add UPDATE policy for super_admin and national_admin users to update files
    - Add DELETE policy for super_admin and national_admin users to delete files
    - Also add alfie_knowledge_documents management policies for super/national admins

  2. Security
    - Only super_admin and national_admin users can upload/modify/delete files
    - Authenticated users retain read access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Super and national admins can upload alfie knowledge files'
  ) THEN
    CREATE POLICY "Super and national admins can upload alfie knowledge files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'alfie-knowledge'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Super and national admins can update alfie knowledge files'
  ) THEN
    CREATE POLICY "Super and national admins can update alfie knowledge files"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'alfie-knowledge'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      )
      WITH CHECK (
        bucket_id = 'alfie-knowledge'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Super and national admins can delete alfie knowledge files'
  ) THEN
    CREATE POLICY "Super and national admins can delete alfie knowledge files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'alfie-knowledge'
        AND EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'alfie_knowledge_documents' 
    AND policyname = 'Super and national admins can manage knowledge documents'
  ) THEN
    CREATE POLICY "Super and national admins can manage knowledge documents"
      ON alfie_knowledge_documents FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('super_admin', 'national_admin')
        )
      );
  END IF;
END $$;
