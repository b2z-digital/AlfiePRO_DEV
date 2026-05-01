/*
  # Add Background Music Track and Per-Event Custom Sound Support to Start Box

  1. Modified Tables
    - `start_sequences`
      - `background_music_url` (text, nullable) - URL of the background music track
      - `background_music_path` (text, nullable) - Storage path of the background music file
      - `background_music_volume` (numeric, default 0.6) - Volume level for background music (0-1)
      - `background_music_duck_volume` (numeric, default 0.15) - Volume to duck to when sound events fire
      - `background_music_duck_duration_ms` (integer, default 3000) - How long to duck for each event
      - `background_music_fade_in_ms` (integer, default 2000) - Fade in duration at start
      - `background_music_fade_out_ms` (integer, default 3000) - Fade out duration at end
      - `use_background_music` (boolean, default false) - Whether to enable background music

    - `start_sequence_sounds`
      - `custom_sound_url` (text, nullable) - Direct URL for a custom uploaded sound (overrides sound_id)
      - `custom_sound_path` (text, nullable) - Storage path for custom sound file
      - `custom_sound_name` (text, nullable) - Display name for the custom sound

  2. Important Notes
    - Background music replaces the countdown beep option for sequences that use it
    - When background music is enabled, it automatically ducks for each sound event
    - Custom sound on a sequence_sound overrides the library sound_id selection
    - The sound_id column becomes nullable to support custom sounds without library entries
*/

-- Add background music columns to start_sequences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_url'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_path'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_volume'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_volume numeric DEFAULT 0.6;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_duck_volume'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_duck_volume numeric DEFAULT 0.15;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_duck_duration_ms'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_duck_duration_ms integer DEFAULT 3000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_fade_in_ms'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_fade_in_ms integer DEFAULT 2000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'background_music_fade_out_ms'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN background_music_fade_out_ms integer DEFAULT 3000;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'use_background_music'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN use_background_music boolean DEFAULT false;
  END IF;
END $$;

-- Add custom sound columns to start_sequence_sounds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequence_sounds' AND column_name = 'custom_sound_url'
  ) THEN
    ALTER TABLE start_sequence_sounds ADD COLUMN custom_sound_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequence_sounds' AND column_name = 'custom_sound_path'
  ) THEN
    ALTER TABLE start_sequence_sounds ADD COLUMN custom_sound_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequence_sounds' AND column_name = 'custom_sound_name'
  ) THEN
    ALTER TABLE start_sequence_sounds ADD COLUMN custom_sound_name text;
  END IF;
END $$;

-- Make sound_id nullable to support custom-only sounds
ALTER TABLE start_sequence_sounds ALTER COLUMN sound_id DROP NOT NULL;
