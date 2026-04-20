/*
  # Add countdown beep and minute callout audio to start sequences

  1. Modified Tables
    - `start_sequences`
      - `enable_countdown_beep` (boolean, default false) - Play a beep on every second during LED countdown
      - `minute_callout_sound_id` (uuid, nullable) - Sound from library to play at each minute mark

  2. Notes
    - Countdown beep uses a synthesized beep (no audio file needed)
    - Minute callout sound references a sound from the start_box_sounds library
    - Both features are opt-in per sequence
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'enable_countdown_beep'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN enable_countdown_beep boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'minute_callout_sound_id'
  ) THEN
    ALTER TABLE start_sequences ADD COLUMN minute_callout_sound_id uuid REFERENCES start_box_sounds(id) ON DELETE SET NULL;
  END IF;
END $$;
