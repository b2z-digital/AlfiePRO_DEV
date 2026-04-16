/*
  # Fix Start Sequences & Sounds RLS for Super Admins

  1. Problem
    - RLS policies on `start_sequences` and `start_sequence_sounds` only checked
      `user_clubs.role = 'super_admin'` for system entries (club_id IS NULL)
    - Super admin status is stored in `profiles.is_super_admin`, not user_clubs
    - This prevented super admins from creating, editing, or deleting system sequences
      and toggling audio-only mode

  2. Fix
    - Replace INSERT, UPDATE, and DELETE policies on `start_sequences` to also check
      `profiles.is_super_admin = true` via the existing `is_super_admin()` function
    - Replace INSERT, UPDATE, and DELETE policies on `start_sequence_sounds` similarly
    - SELECT policies remain unchanged (they already work correctly)
*/

-- ============================================================
-- Fix start_sequences policies
-- ============================================================

-- DROP existing INSERT policy
DROP POLICY IF EXISTS "Club admins can create club sequences" ON public.start_sequences;

-- CREATE replacement INSERT policy
CREATE POLICY "Club admins can create club sequences"
  ON public.start_sequences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing UPDATE policy
DROP POLICY IF EXISTS "Club admins can update club sequences" ON public.start_sequences;

-- CREATE replacement UPDATE policy
CREATE POLICY "Club admins can update club sequences"
  ON public.start_sequences
  FOR UPDATE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing DELETE policy
DROP POLICY IF EXISTS "Club admins can delete club sequences" ON public.start_sequences;

-- CREATE replacement DELETE policy
CREATE POLICY "Club admins can delete club sequences"
  ON public.start_sequences
  FOR DELETE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND is_system_default = false AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );

-- ============================================================
-- Fix start_sequence_sounds policies
-- ============================================================

-- DROP existing INSERT policy
DROP POLICY IF EXISTS "Club admins can create sequence sounds" ON public.start_sequence_sounds;

-- CREATE replacement INSERT policy
CREATE POLICY "Club admins can create sequence sounds"
  ON public.start_sequence_sounds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        (seq.club_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR (seq.club_id IS NULL AND (
          public.is_super_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.user_clubs
            WHERE user_clubs.user_id = auth.uid()
            AND user_clubs.role = 'super_admin'
          )
        ))
      )
    )
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing UPDATE policy
DROP POLICY IF EXISTS "Club admins can update sequence sounds" ON public.start_sequence_sounds;

-- CREATE replacement UPDATE policy
CREATE POLICY "Club admins can update sequence sounds"
  ON public.start_sequence_sounds
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        (seq.club_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR (seq.club_id IS NULL AND (
          public.is_super_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.user_clubs
            WHERE user_clubs.user_id = auth.uid()
            AND user_clubs.role = 'super_admin'
          )
        ))
      )
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        (seq.club_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR (seq.club_id IS NULL AND (
          public.is_super_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.user_clubs
            WHERE user_clubs.user_id = auth.uid()
            AND user_clubs.role = 'super_admin'
          )
        ))
      )
    )
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing DELETE policy
DROP POLICY IF EXISTS "Club admins can delete sequence sounds" ON public.start_sequence_sounds;

-- CREATE replacement DELETE policy
CREATE POLICY "Club admins can delete sequence sounds"
  ON public.start_sequence_sounds
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        (seq.club_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR (seq.club_id IS NULL AND (
          public.is_super_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.user_clubs
            WHERE user_clubs.user_id = auth.uid()
            AND user_clubs.role = 'super_admin'
          )
        ))
      )
    )
    OR public.is_super_admin(auth.uid())
  );

-- ============================================================
-- Also fix start_box_sounds RLS policies to match
-- ============================================================

-- DROP existing INSERT policy
DROP POLICY IF EXISTS "Club admins can create club sounds" ON public.start_box_sounds;

-- CREATE replacement INSERT policy
CREATE POLICY "Club admins can create club sounds"
  ON public.start_box_sounds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing UPDATE policy
DROP POLICY IF EXISTS "Club admins can update club sounds" ON public.start_box_sounds;

-- CREATE replacement UPDATE policy
CREATE POLICY "Club admins can update club sounds"
  ON public.start_box_sounds
  FOR UPDATE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );

-- DROP existing DELETE policy
DROP POLICY IF EXISTS "Club admins can delete club sounds" ON public.start_box_sounds;

-- CREATE replacement DELETE policy
CREATE POLICY "Club admins can delete club sounds"
  ON public.start_box_sounds
  FOR DELETE
  TO authenticated
  USING (
    (club_id IS NOT NULL AND is_system_default = false AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
        AND user_clubs.role = 'super_admin'
      )
    ))
    OR public.is_super_admin(auth.uid())
  );
