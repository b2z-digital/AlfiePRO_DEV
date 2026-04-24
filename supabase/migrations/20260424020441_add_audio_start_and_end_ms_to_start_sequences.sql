/*
  # Add audio start and end millisecond markers to start sequences

  1. Modified Tables
    - `start_sequences`
      - `audio_start_ms` (integer, default 0) - Where to start playing the audio file (trim start)
      - `audio_end_ms` (integer, nullable) - Where to stop playing the audio file (trim end), null = play to end

  2. Notes
    - These markers allow users to trim the playback range of their MP3 files
    - Useful for MP3s that contain both countdown and count-up sections
    - audio_start_ms replaces the role of audio_offset_ms for audio-only mode
    - audio_end_ms allows stopping playback at a specific point
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'audio_start_ms'
  ) THEN
    ALTER TABLE public.start_sequences ADD COLUMN audio_start_ms integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'audio_end_ms'
  ) THEN
    ALTER TABLE public.start_sequences ADD COLUMN audio_end_ms integer;
  END IF;
END $$;
