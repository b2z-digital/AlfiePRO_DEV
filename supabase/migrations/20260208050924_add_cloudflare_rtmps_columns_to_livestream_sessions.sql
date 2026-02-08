/*
  # Add Cloudflare RTMPS columns to livestream sessions

  1. Modified Tables
    - `livestream_sessions`
      - `cloudflare_rtmps_url` (text) - Cloudflare RTMP ingest URL for OBS/external encoder
      - `cloudflare_rtmps_stream_key` (text) - Cloudflare RTMP stream key

  2. Purpose
    - Store the Cloudflare RTMP ingest credentials so users can connect OBS
      or other RTMP encoders to Cloudflare, which then relays to YouTube
      via a pre-configured output
    - Cloudflare's WebRTC/WHIP ingest does not support output restreaming,
      but RTMP ingest does
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_rtmps_url'
  ) THEN
    ALTER TABLE public.livestream_sessions ADD COLUMN cloudflare_rtmps_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_rtmps_stream_key'
  ) THEN
    ALTER TABLE public.livestream_sessions ADD COLUMN cloudflare_rtmps_stream_key text;
  END IF;
END $$;