/*
# Add event_id to pro_rosters

1. Modified Tables
   - `pro_rosters`: Added `event_id` (text, nullable) to link single-event rosters
     to a specific quick_race record. Series rosters continue using `series_id`.

2. Notes
   - event_id is nullable: series rosters use series_id, single-event rosters use event_id
   - Both can be null for standalone date-based rosters
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pro_rosters'
      AND column_name = 'event_id'
  ) THEN
    ALTER TABLE pro_rosters ADD COLUMN event_id text;
  END IF;
END $$;
