/*
# Add skip_seeding_race option to handicap ruleset config

1. Modified Tables
   - `handicap_ruleset_config`: Added `skip_seeding_race` (boolean, default false)
   - When true, the ruleset's adjustment rules apply from Race 1 onwards
     instead of running the automatic seeding race that assigns handicaps
     based on finishing position.

2. Important Notes
   - Defaults to false so existing rulesets behave as before.
   - Purely additive, no data loss.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'handicap_ruleset_config'
      AND column_name = 'skip_seeding_race'
  ) THEN
    ALTER TABLE handicap_ruleset_config
      ADD COLUMN skip_seeding_race boolean NOT NULL DEFAULT false;
  END IF;
END $$;
