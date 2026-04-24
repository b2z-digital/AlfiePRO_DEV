/*
  # Fix missing minute_callout_sound_id column on start_sequences

  1. Modified Tables
    - `start_sequences`
      - Add `minute_callout_sound_id` (uuid, nullable, FK to start_box_sounds)

  2. Notes
    - This column was supposed to be added by a prior migration but is missing from the actual schema
    - Re-adding it with IF NOT EXISTS safety check
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'start_sequences'
    AND column_name = 'minute_callout_sound_id'
  ) THEN
    ALTER TABLE public.start_sequences 
      ADD COLUMN minute_callout_sound_id uuid REFERENCES public.start_box_sounds(id) ON DELETE SET NULL;
  END IF;
END $$;