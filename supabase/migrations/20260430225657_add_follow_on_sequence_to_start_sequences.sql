/*
  # Add follow-on sequence support for BOTW chaining

  1. Modified Tables
    - `start_sequences`
      - `follow_on_sequence_id` (uuid, nullable) - references another start_sequence that should automatically play after this one completes (used for BOTW → start sequence chaining)

  2. Notes
    - Self-referencing foreign key on start_sequences
    - Only relevant for BOTW sequences, but available on all for flexibility
    - Default is NULL (no follow-on)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'follow_on_sequence_id'
  ) THEN
    ALTER TABLE public.start_sequences
      ADD COLUMN follow_on_sequence_id uuid REFERENCES public.start_sequences(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Set default follow-on for existing BOTW sequences to the "1 Minute Scratch" system sequence if it exists
UPDATE public.start_sequences botw
SET follow_on_sequence_id = (
  SELECT id FROM public.start_sequences
  WHERE sequence_type = 'standard'
    AND is_system_default = true
    AND total_duration_seconds = 60
    AND name ILIKE '%1 min%'
  ORDER BY sort_order ASC
  LIMIT 1
)
WHERE botw.sequence_type = 'botw'
  AND botw.follow_on_sequence_id IS NULL;