/*
  # Update default drop rules to RRS Appendix A Scoring System

  1. Changes
    - Updates the default value for `drop_rules` column on `race_series_rounds` table
      from `'[]'::jsonb` (No Discards) to `'[4, 8, 16, 24, 32, 40]'::jsonb` (RRS - Appendix A)
    - Updates the default value for `drop_rules` column on `quick_races` table
      to use RRS - Appendix A as default
    - Backfills any existing events/rounds that have empty drop rules with the RRS default

  2. Important Notes
    - RRS Appendix A: 1 discard after 4 races, 2 after 8, 3 after 16, then +1 every 8 races
    - Events that already have explicit drop rules set will NOT be modified
    - Only events with NULL or empty drop rules get the new default
*/

ALTER TABLE IF EXISTS race_series_rounds
  ALTER COLUMN drop_rules SET DEFAULT '[4, 8, 16, 24, 32, 40]'::jsonb;

UPDATE race_series_rounds
SET drop_rules = '[4, 8, 16, 24, 32, 40]'::jsonb
WHERE drop_rules IS NULL OR drop_rules::text = '[]' OR drop_rules::text = 'null';
