/*
  # Add youtube_stream_id to livestream_sessions

  1. Modified Tables
    - `livestream_sessions`
      - Added `youtube_stream_id` (text, nullable) - Stores the YouTube live stream ID for health checking

  2. Purpose
    - Allows checking the YouTube stream's health status before attempting broadcast transitions
    - Needed to determine if Cloudflare is successfully relaying data to YouTube
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'youtube_stream_id'
  ) THEN
    ALTER TABLE public.livestream_sessions ADD COLUMN youtube_stream_id text;
  END IF;
END $$;