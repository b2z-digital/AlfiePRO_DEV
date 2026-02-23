/*
  # Add audio-only mode to start sequences

  1. Modified Tables
    - `start_sequences`
      - `use_audio_only` (boolean, default false) - When true, sequence plays only the uploaded MP3 file without individual sound events
      - `countdown_start_seconds` (integer, default null) - When set, the LED countdown starts from this value (allows syncing visual countdown to audio)

  2. Notes
    - Audio-only mode means the sequence ignores individual sound timeline events
    - The countdown_start_seconds allows users to sync the visual LED countdown to match their pre-recorded audio file
    - Existing sequences remain unchanged (use_audio_only defaults to false)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'use_audio_only'
  ) THEN
    ALTER TABLE public.start_sequences ADD COLUMN use_audio_only boolean DEFAULT false NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'countdown_start_seconds'
  ) THEN
    ALTER TABLE public.start_sequences ADD COLUMN countdown_start_seconds integer DEFAULT NULL;
  END IF;
END $$;
