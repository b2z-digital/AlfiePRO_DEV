/*
# Add default handicap ruleset reference to clubs

1. Modified Tables
   - `clubs`: Added `default_handicap_ruleset_id` (uuid, nullable, FK to handicap_rulesets)
   - Allows each club to set their preferred handicap scoring system
   
2. Also adds `handicap_ruleset_id` to `quick_races` table
   - Allows individual events to override the club default with a specific ruleset

3. Important Notes
   - Nullable FK so clubs without a custom ruleset use the system default
   - No data loss -- purely additive
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'default_handicap_ruleset_id'
  ) THEN
    ALTER TABLE clubs ADD COLUMN default_handicap_ruleset_id uuid REFERENCES handicap_rulesets(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_races' AND column_name = 'handicap_ruleset_id'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN handicap_ruleset_id uuid REFERENCES handicap_rulesets(id) ON DELETE SET NULL;
  END IF;
END $$;
