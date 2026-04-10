/*
  # Add is_test flag to clubs

  1. Changes
    - Adds `is_test` boolean column to clubs table (default false)
    - Marks "Alfie Radio Yacht Club" as a test club
  
  2. Important Notes
    - Test clubs should only be visible to super admins
    - They should be hidden from state/national admin club lists, 
      member signups, and public pages
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE public.clubs ADD COLUMN is_test boolean DEFAULT false;
  END IF;
END $$;

UPDATE public.clubs 
SET is_test = true 
WHERE id = 'f94ef8eb-340d-4145-8fa1-bfd684e4f1fe';
