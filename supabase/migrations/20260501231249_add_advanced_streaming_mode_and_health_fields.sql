/*
  # Add Advanced Streaming Mode and Health Tracking

  1. Modified Tables
    - `livestream_sessions`
      - `stream_input_mode` (text) - 'browser' (default WHIP), 'rtmp_external' (OBS/ATEM etc)
      - `enable_alfie_overlay` (boolean) - Whether Alfie applies overlay (vs external OBS overlay)
      - `auto_record` (boolean) - Whether to auto-record segments
      - `recording_mode` (text) - 'auto', 'manual', 'both' (local + cloud)
      - `stream_health` (jsonb) - Live health metrics (bitrate, fps, resolution, connection quality)
      - `signal_detected` (boolean) - Whether incoming signal is detected
      - `signal_detected_at` (timestamptz) - When signal was first detected
      - `last_signal_at` (timestamptz) - Last signal heartbeat
      - `reconnect_attempts` (integer) - Number of auto-reconnect attempts
      - `encoding_config` (jsonb) - Recommended/detected encoding settings
      - `network_config` (jsonb) - Network recommendations and status

  2. Purpose
    - Support advanced RTMP ingest from external encoders (OBS, ATEM, etc.)
    - Track real-time stream health metrics
    - Enable signal detection and auto-reconnect
    - Store encoding recommendations and detected settings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'stream_input_mode'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN stream_input_mode text DEFAULT 'browser';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'enable_alfie_overlay'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN enable_alfie_overlay boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'auto_record'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN auto_record boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'recording_mode'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN recording_mode text DEFAULT 'auto';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'stream_health'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN stream_health jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'signal_detected'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN signal_detected boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'signal_detected_at'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN signal_detected_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'last_signal_at'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN last_signal_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'reconnect_attempts'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN reconnect_attempts integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'encoding_config'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN encoding_config jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'network_config'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN network_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
