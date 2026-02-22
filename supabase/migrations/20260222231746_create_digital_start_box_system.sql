/*
  # Digital StartBox System

  1. New Tables
    - `start_box_sounds` - Audio file library for start signals
      - `id` (uuid, primary key)
      - `club_id` (uuid, nullable - NULL means global/system sound)
      - `name` (text) - Display name e.g. "Warning Horn"
      - `description` (text, nullable)
      - `file_path` (text) - Path in storage bucket
      - `file_url` (text) - Public URL for playback
      - `file_size` (integer, nullable) - Bytes
      - `duration_ms` (integer, nullable) - Duration in milliseconds
      - `mime_type` (text) - Audio MIME type
      - `is_system_default` (boolean) - True for built-in sounds
      - `created_by` (uuid, nullable)
      - `created_at`, `updated_at` (timestamptz)

    - `start_sequences` - Named start sequence configurations
      - `id` (uuid, primary key)
      - `club_id` (uuid, nullable - NULL means global default)
      - `name` (text) - e.g. "2 Minute Start"
      - `description` (text, nullable)
      - `sequence_type` (text) - standard/handicap/botw/special
      - `total_duration_seconds` (integer) - Countdown length
      - `is_system_default` (boolean)
      - `is_active` (boolean)
      - `race_type_default` (text, nullable) - scratch/handicap
      - `sort_order` (integer)
      - `created_by` (uuid, nullable)
      - `created_at`, `updated_at` (timestamptz)

    - `start_sequence_sounds` - Timed sound events within a sequence
      - `id` (uuid, primary key)
      - `sequence_id` (uuid) - Parent sequence
      - `sound_id` (uuid) - Audio file reference
      - `trigger_time_seconds` (integer) - Countdown seconds remaining when triggered
      - `label` (text, nullable) - e.g. "Warning Signal"
      - `repeat_count` (integer) - Times to repeat
      - `repeat_interval_ms` (integer, nullable)
      - `volume_override` (numeric, nullable) - 0.00-1.00
      - `sort_order` (integer)
      - `created_at` (timestamptz)

  2. Storage
    - `start-box-sounds` bucket for audio file uploads (10MB limit)

  3. Security
    - RLS enabled on all tables
    - Authenticated users can read global + their club sounds/sequences
    - Club admins can manage club-specific sounds/sequences
    - Super admins can manage global defaults

  4. Columns Added
    - `quick_races.start_sequence_id` - Selected start sequence for a race
    - `race_series.start_sequence_id` - Selected start sequence for a series

  5. Seed Data
    - System default sounds (horn, whistle, bell, beep)
    - System default sequences (2 Min, 1 Min, Handicap, BOTW variants)
*/

-- ============================================================
-- Table: start_box_sounds
-- ============================================================
CREATE TABLE IF NOT EXISTS public.start_box_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  duration_ms integer,
  mime_type text NOT NULL DEFAULT 'audio/mpeg',
  is_system_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.start_box_sounds ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_start_box_sounds_club_id ON public.start_box_sounds(club_id);
CREATE INDEX IF NOT EXISTS idx_start_box_sounds_system_default ON public.start_box_sounds(is_system_default);

CREATE POLICY "Users can view global and own club sounds"
  ON public.start_box_sounds
  FOR SELECT
  TO authenticated
  USING (
    club_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
    )
  );

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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );

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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  )
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_box_sounds.club_id
      AND user_clubs.role IN ('admin', 'super_admin')
    ))
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );

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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );

-- ============================================================
-- Table: start_sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.start_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sequence_type text NOT NULL DEFAULT 'standard'
    CHECK (sequence_type IN ('standard', 'handicap', 'botw', 'special')),
  total_duration_seconds integer NOT NULL,
  is_system_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  race_type_default text CHECK (race_type_default IS NULL OR race_type_default IN ('scratch', 'handicap')),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.start_sequences ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_start_sequences_club_id ON public.start_sequences(club_id);
CREATE INDEX IF NOT EXISTS idx_start_sequences_type ON public.start_sequences(sequence_type);
CREATE INDEX IF NOT EXISTS idx_start_sequences_race_default ON public.start_sequences(race_type_default);

CREATE POLICY "Users can view global and own club sequences"
  ON public.start_sequences
  FOR SELECT
  TO authenticated
  USING (
    club_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.club_id = start_sequences.club_id
    )
  );

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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );

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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  )
  WITH CHECK (
    (club_id IS NOT NULL AND EXISTS (
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
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.user_clubs
      WHERE user_clubs.user_id = auth.uid()
      AND user_clubs.role = 'super_admin'
    ))
  );

-- ============================================================
-- Table: start_sequence_sounds
-- ============================================================
CREATE TABLE IF NOT EXISTS public.start_sequence_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.start_sequences(id) ON DELETE CASCADE,
  sound_id uuid NOT NULL REFERENCES public.start_box_sounds(id) ON DELETE CASCADE,
  trigger_time_seconds integer NOT NULL,
  label text,
  repeat_count integer NOT NULL DEFAULT 1,
  repeat_interval_ms integer,
  volume_override numeric(3,2),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.start_sequence_sounds ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_start_sequence_sounds_sequence_id ON public.start_sequence_sounds(sequence_id);
CREATE INDEX IF NOT EXISTS idx_start_sequence_sounds_sound_id ON public.start_sequence_sounds(sound_id);

CREATE POLICY "Users can view sequence sounds for accessible sequences"
  ON public.start_sequence_sounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        seq.club_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
        )
      )
    )
  );

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
        OR (seq.club_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        ))
      )
    )
  );

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
        OR (seq.club_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        ))
      )
    )
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
        OR (seq.club_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        ))
      )
    )
  );

CREATE POLICY "Club admins can delete sequence sounds"
  ON public.start_sequence_sounds
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.start_sequences seq
      WHERE seq.id = start_sequence_sounds.sequence_id
      AND (
        (seq.club_id IS NOT NULL AND seq.is_system_default = false AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = seq.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
        ))
        OR (seq.club_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
        ))
      )
    )
  );

-- ============================================================
-- Storage bucket for audio files
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'start-box-sounds',
  'start-box-sounds',
  true,
  10485760,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-wav', 'audio/webm']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload start box sounds"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'start-box-sounds');

CREATE POLICY "Anyone can view start box sounds"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'start-box-sounds');

CREATE POLICY "Authenticated users can delete start box sounds"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'start-box-sounds');

-- ============================================================
-- Add start_sequence_id to quick_races and race_series
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_races' AND column_name = 'start_sequence_id'
  ) THEN
    ALTER TABLE public.quick_races ADD COLUMN start_sequence_id uuid REFERENCES public.start_sequences(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'race_series' AND column_name = 'start_sequence_id'
  ) THEN
    ALTER TABLE public.race_series ADD COLUMN start_sequence_id uuid REFERENCES public.start_sequences(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- Seed system default sounds (using synthesized/built-in references)
-- ============================================================
INSERT INTO public.start_box_sounds (id, club_id, name, description, file_path, file_url, mime_type, is_system_default, duration_ms)
VALUES
  ('a0000001-0000-0000-0000-000000000001', NULL, 'Warning Horn', 'Long air horn blast for warning signal', 'system/horn-warning.mp3', '/sounds/horn-warning.mp3', 'audio/mpeg', true, 2000),
  ('a0000001-0000-0000-0000-000000000002', NULL, 'Start Horn', 'Short sharp horn blast for start signal', 'system/horn-start.mp3', '/sounds/horn-start.mp3', 'audio/mpeg', true, 1500),
  ('a0000001-0000-0000-0000-000000000003', NULL, 'Whistle', 'Race officer whistle', 'system/whistle.mp3', '/sounds/whistle.mp3', 'audio/mpeg', true, 1000),
  ('a0000001-0000-0000-0000-000000000004', NULL, 'Bell', 'Attention bell', 'system/bell.mp3', '/sounds/bell.mp3', 'audio/mpeg', true, 1500),
  ('a0000001-0000-0000-0000-000000000005', NULL, 'Countdown Beep', 'Short beep for countdown', 'system/beep.mp3', '/sounds/beep.mp3', 'audio/mpeg', true, 200),
  ('a0000001-0000-0000-0000-000000000006', NULL, 'Double Horn', 'Two short horn blasts', 'system/horn-double.mp3', '/sounds/horn-double.mp3', 'audio/mpeg', true, 2500)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed system default sequences
-- ============================================================
INSERT INTO public.start_sequences (id, club_id, name, description, sequence_type, total_duration_seconds, is_system_default, race_type_default, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000001', NULL, '2 Minute Start', 'Standard 2-minute countdown with warning at T-2:00 and start at T-0:00', 'standard', 120, true, 'scratch', 1),
  ('b0000001-0000-0000-0000-000000000002', NULL, '1 Minute Start', 'Quick 1-minute countdown', 'standard', 60, true, NULL, 2),
  ('b0000001-0000-0000-0000-000000000003', NULL, 'Handicap Start', '2-minute handicap start sequence', 'handicap', 120, true, 'handicap', 3),
  ('b0000001-0000-0000-0000-000000000004', NULL, 'BOTW 3 Minutes', 'Build on the Whistle - 3 minute countdown', 'botw', 180, true, NULL, 4),
  ('b0000001-0000-0000-0000-000000000005', NULL, 'BOTW 4 Minutes', 'Build on the Whistle - 4 minute countdown', 'botw', 240, true, NULL, 5),
  ('b0000001-0000-0000-0000-000000000006', NULL, 'BOTW 5 Minutes', 'Build on the Whistle - 5 minute countdown', 'botw', 300, true, NULL, 6),
  ('b0000001-0000-0000-0000-000000000007', NULL, 'BOTW 8 Minutes', 'Build on the Whistle - 8 minute countdown', 'botw', 480, true, NULL, 7),
  ('b0000001-0000-0000-0000-000000000008', NULL, 'BOTW 10 Minutes', 'Build on the Whistle - 10 minute countdown', 'botw', 600, true, NULL, 8)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed sequence sound events for default sequences
-- ============================================================

-- 2 Minute Start: horn at T-120, horn at T-60, beeps at T-10 to T-1, horn at T-0
INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 120, 'Warning Signal', 1),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 60, 'Preparatory Signal', 2),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 10, '10 Second Warning', 3),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 4, '4 Seconds', 5),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 3, '3 Seconds', 6),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 2, '2 Seconds', 7),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 1, '1 Second', 8),
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002', 0, 'Start Signal', 9);

-- 1 Minute Start: horn at T-60, beeps at T-5 to T-1, horn at T-0
INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 60, 'Warning Signal', 1),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 2),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 4, '4 Seconds', 3),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 3, '3 Seconds', 4),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 2, '2 Seconds', 5),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 1, '1 Second', 6),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 0, 'Start Signal', 7);

-- Handicap Start: horn at T-120, horn at T-60, beeps at T-10 to T-1, double horn at T-0
INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 120, 'Attention Signal', 1),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 60, 'Preparatory Signal', 2),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 10, '10 Second Warning', 3),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 4, '4 Seconds', 5),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 3, '3 Seconds', 6),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 2, '2 Seconds', 7),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000005', 1, '1 Second', 8),
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000006', 0, 'Handicap Start', 9);

-- BOTW sequences all get: horn at total time, horn at T-60 (if applicable), beeps T-5 to T-1, horn at T-0
INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 180, 'Start Countdown', 1),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 120, '2 Minute Warning', 2),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 60, '1 Minute Warning', 3),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000002', 0, 'Start', 5);

INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001', 240, 'Start Countdown', 1),
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001', 120, '2 Minute Warning', 2),
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001', 60, '1 Minute Warning', 3),
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000002', 0, 'Start', 5);

INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000001', 300, 'Start Countdown', 1),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000001', 120, '2 Minute Warning', 2),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000001', 60, '1 Minute Warning', 3),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000002', 0, 'Start', 5);

INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000001', 480, 'Start Countdown', 1),
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000001', 120, '2 Minute Warning', 2),
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000001', 60, '1 Minute Warning', 3),
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000002', 0, 'Start', 5);

INSERT INTO public.start_sequence_sounds (sequence_id, sound_id, trigger_time_seconds, label, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000001', 600, 'Start Countdown', 1),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000001', 120, '2 Minute Warning', 2),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000001', 60, '1 Minute Warning', 3),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000005', 5, '5 Second Warning', 4),
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000002', 0, 'Start', 5);

-- ============================================================
-- Register feature in platform controls
-- ============================================================
INSERT INTO public.platform_feature_controls (feature_key, feature_label, feature_description, feature_group, is_globally_enabled)
VALUES (
  'digital_start_box',
  'Digital StartBox',
  'Digital race start box with countdown timer, sound sequences, and touch-mode controls for race officers.',
  'racing',
  true
)
ON CONFLICT (feature_key) DO NOTHING;