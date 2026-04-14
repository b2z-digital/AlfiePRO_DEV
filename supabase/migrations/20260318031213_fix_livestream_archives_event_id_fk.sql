/*
  # Fix livestream archives event_id foreign key

  1. Modified Tables
    - `livestream_archives`
      - Drop FK constraint on `event_id` that references `quick_races`
      - Change `event_id` from uuid to text to match `livestream_sessions.event_id`
      
  2. Notes
    - The `event_id` field stores references to either quick_races OR race_series_rounds
    - A strict FK to just quick_races prevents archive creation for series rounds
    - Changing to text matches the `livestream_sessions.event_id` column type
*/

ALTER TABLE livestream_archives
  DROP CONSTRAINT IF EXISTS livestream_archives_event_id_fkey;

ALTER TABLE livestream_archives
  ALTER COLUMN event_id TYPE text USING event_id::text;
