/*
  # Add countdown audio file support to start sequences

  1. Modified Tables
    - `start_sequences`
      - `audio_file_path` (text, nullable) - Storage path for the uploaded MP3 countdown audio
      - `audio_file_url` (text, nullable) - Public URL for the countdown audio file
      - `audio_offset_ms` (integer, default 0) - Millisecond offset to fine-tune sync between audio and timer

  2. Notes
    - Allows each sequence to have a pre-recorded MP3 countdown audio that plays in sync with the LED timer
    - The audio_offset_ms field allows fine-tuning if the audio needs to start slightly earlier/later
    - Existing sequences are unaffected (new columns are nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'audio_file_path'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN audio_file_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'audio_file_url'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN audio_file_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'audio_offset_ms'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN audio_offset_ms integer DEFAULT 0;
  END IF;
END $$;
