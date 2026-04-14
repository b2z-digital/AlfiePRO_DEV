/*
  # Fix start sequences delete policy for super admins

  1. Changes
    - Drop existing delete policy on `start_sequences`
    - Create new delete policy that allows:
      - Super admins (via JWT metadata or user_clubs role) to delete ANY sequence
      - Club admins to delete non-system club sequences as before

  2. Security
    - Super admins can delete system and non-system sequences
    - Club admins can only delete their own club's non-system sequences
*/

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.start_sequences'::regclass
    AND polname = 'Club admins can delete club sequences'
  ) THEN
    DROP POLICY "Club admins can delete club sequences" ON public.start_sequences;
  END IF;
END $$;

CREATE POLICY "Admins can delete sequences"
  ON public.start_sequences
  FOR DELETE
  TO authenticated
  USING (
    (SELECT COALESCE((auth.jwt()->>'user_metadata')::jsonb->>'is_super_admin', 'false')::boolean)
    OR (club_id IS NOT NULL AND is_system_default = false AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );
