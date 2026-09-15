/*
# Add persist_handicaps toggle to handicap ruleset config

1. Modified Tables
   - `handicap_ruleset_config`
     - `persist_handicaps` (boolean, default true) — When true, post-race handicap
       adjustments are automatically saved back to each member's boat record.
       When false, handicaps are calculated during scoring but NOT written back,
       allowing race officers to manage handicaps manually.

2. Important Notes
   - Default is TRUE so all existing clubs continue to work exactly as before.
   - Only affects automatic post-race persistence; manual handicap edits by
     race officers are always allowed.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'handicap_ruleset_config'
    AND column_name = 'persist_handicaps'
  ) THEN
    ALTER TABLE handicap_ruleset_config
    ADD COLUMN persist_handicaps boolean NOT NULL DEFAULT true;
  END IF;
END $$;
