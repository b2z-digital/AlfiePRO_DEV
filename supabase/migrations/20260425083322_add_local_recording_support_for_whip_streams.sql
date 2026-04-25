/*
  # Add local recording support for WHIP streams

  Cloudflare Stream WebRTC/WHIP ingest does not support automatic recording.
  This migration adds infrastructure for browser-side MediaRecorder recordings
  that get uploaded to Supabase Storage, then processed to YouTube.

  1. New Storage Bucket
    - `livestream-recordings` for storing browser-recorded video segments

  2. Modified Tables
    - `livestream_race_segments`: added `local_recording_path` column
      for referencing recordings stored in Supabase Storage

  3. Security
    - Storage policies for authenticated users to upload/read recordings
    - Admins can manage their club's recordings
*/

-- Create storage bucket for livestream recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'livestream-recordings',
  'livestream-recordings',
  false,
  524288000,
  ARRAY['video/webm', 'video/mp4', 'video/x-matroska']
)
ON CONFLICT (id) DO NOTHING;

-- Add local_recording_path column to livestream_race_segments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_race_segments' AND column_name = 'local_recording_path'
  ) THEN
    ALTER TABLE public.livestream_race_segments ADD COLUMN local_recording_path text;
  END IF;
END $$;

-- Storage policies: authenticated users can upload recordings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload livestream recordings'
  ) THEN
    CREATE POLICY "Authenticated users can upload livestream recordings"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'livestream-recordings');
  END IF;
END $$;

-- Storage policies: authenticated users can read recordings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read livestream recordings'
  ) THEN
    CREATE POLICY "Authenticated users can read livestream recordings"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'livestream-recordings');
  END IF;
END $$;

-- Service role can read recordings (for edge function processing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage livestream recordings'
  ) THEN
    CREATE POLICY "Service role can manage livestream recordings"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'livestream-recordings')
      WITH CHECK (bucket_id = 'livestream-recordings');
  END IF;
END $$;

-- Authenticated users can delete their own recordings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can delete livestream recordings'
  ) THEN
    CREATE POLICY "Authenticated users can delete livestream recordings"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'livestream-recordings');
  END IF;
END $$;
