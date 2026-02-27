/*
  # Add selected boat class IDs to club setup applications

  1. Modified Tables
    - `club_setup_applications`
      - Added `selected_boat_class_ids` (jsonb, default '[]') - stores array of boat class IDs selected during club setup

  2. Purpose
    - Allows the self-registration club setup wizard to persist yacht class selections as part of the draft application
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_setup_applications' AND column_name = 'selected_boat_class_ids'
  ) THEN
    ALTER TABLE club_setup_applications ADD COLUMN selected_boat_class_ids jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
