/*
  # Change auto-complete sail number default to true

  1. Modified Tables
    - `quick_races`
      - Changed `auto_complete_sail` default from false to true
    - `race_series_rounds`
      - Changed `auto_complete_sail` default from false to true

  2. Notes
    - Auto-complete sail numbers is now enabled by default for spreadsheet scoring mode
    - Existing events that already have a value set will not be affected
    - Only new events will pick up the new default
*/

ALTER TABLE IF EXISTS quick_races
  ALTER COLUMN auto_complete_sail SET DEFAULT true;

ALTER TABLE IF EXISTS race_series_rounds
  ALTER COLUMN auto_complete_sail SET DEFAULT true;