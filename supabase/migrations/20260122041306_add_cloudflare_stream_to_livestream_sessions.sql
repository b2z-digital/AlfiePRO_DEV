/*
  # Add Cloudflare Stream support to livestream sessions

  1. New Columns on `livestream_sessions`
    - `cloudflare_live_input_id` (text) - Cloudflare Stream live input ID
    - `cloudflare_whip_url` (text) - WebRTC WHIP URL for sending video
    - `cloudflare_whip_playback_url` (text) - WebRTC playback URL
    - `cloudflare_output_id` (text) - Cloudflare output ID for YouTube restream
    - `streaming_mode` (text) - Either 'direct_youtube' or 'cloudflare_relay'

  2. Purpose
    - Enables streaming directly from browser to Cloudflare via WebRTC (WHIP)
    - Cloudflare then restreams to YouTube via RTMP
    - Eliminates need for OBS or external encoding software
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_live_input_id'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN cloudflare_live_input_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_whip_url'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN cloudflare_whip_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_whip_playback_url'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN cloudflare_whip_playback_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'cloudflare_output_id'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN cloudflare_output_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'streaming_mode'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN streaming_mode text DEFAULT 'cloudflare_relay';
  END IF;
END $$;
