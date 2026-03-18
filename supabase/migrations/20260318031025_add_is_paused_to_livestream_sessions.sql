/*
  # Add pause tracking to livestream sessions

  1. Modified Tables
    - `livestream_sessions`
      - `is_paused` (boolean, default false) - tracks when broadcaster has paused the stream

  2. Notes
    - Used by AlfieTV viewer to show "Event on Hold" message instead of blank screen
    - Set by broadcast studio when pause/resume buttons are used
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_sessions' AND column_name = 'is_paused'
  ) THEN
    ALTER TABLE livestream_sessions ADD COLUMN is_paused boolean DEFAULT false;
  END IF;
END $$;
