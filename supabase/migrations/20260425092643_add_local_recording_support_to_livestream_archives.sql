/*
  # Add local recording support to livestream archives

  1. Modified Tables
    - `livestream_archives`
      - `storage_path` (text, nullable) - Path to recording in Supabase Storage bucket
      - Update `source` column to support 'local' value for browser-recorded videos

  2. Notes
    - Cloudflare WHIP/WebRTC does not generate server-side recordings
    - Browser MediaRecorder captures locally and uploads to Supabase Storage
    - Archives can now reference local recordings for immediate playback
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_archives' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE livestream_archives ADD COLUMN storage_path text;
  END IF;
END $$;
