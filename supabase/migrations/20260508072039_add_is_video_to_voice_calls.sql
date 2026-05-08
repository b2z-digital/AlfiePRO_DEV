/*
  # Add video call support to voice_calls table

  1. Modified Tables
    - `voice_calls`
      - Added `is_video` (boolean, default false) - indicates if the call includes video

  2. Notes
    - Existing calls default to audio-only (is_video = false)
    - This flag is used to tell the callee whether to expect a video or audio call
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_calls' AND column_name = 'is_video'
  ) THEN
    ALTER TABLE voice_calls ADD COLUMN is_video boolean NOT NULL DEFAULT false;
  END IF;
END $$;
