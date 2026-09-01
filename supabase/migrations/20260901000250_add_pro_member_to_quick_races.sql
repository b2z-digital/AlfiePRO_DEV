/*
# Add PRO (Principal Race Officer) fields to quick_races

1. Modified Tables
   - `quick_races`
     - `pro_member_id` (uuid, nullable) - References the member assigned as PRO
     - `pro_member_name` (text, nullable) - Display name of the PRO member

2. Important Notes
   - These fields allow single/quick race events to have a PRO assigned
   - Series events already have PRO via the pro_rosters system
   - No foreign key constraint on pro_member_id to avoid issues with cross-club references
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_races' AND column_name = 'pro_member_id'
  ) THEN
    ALTER TABLE public.quick_races ADD COLUMN pro_member_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_races' AND column_name = 'pro_member_name'
  ) THEN
    ALTER TABLE public.quick_races ADD COLUMN pro_member_name text;
  END IF;
END $$;
