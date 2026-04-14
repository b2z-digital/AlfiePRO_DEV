/*
  # Add frequency field to club sailing days

  1. Modified Tables
    - `club_sailing_days`
      - Added `frequency` (text) - Sailing frequency: 'every_week', 'week_a', 'week_b'
        - 'every_week' = sails every week on this day
        - 'week_a' = sails on odd weeks (alternating Week A)
        - 'week_b' = sails on even weeks (alternating Week B)

  2. Notes
    - This allows clubs to define alternating sailing schedules
    - e.g., 10 Raters on Week A Sundays, IOM on Week B Sundays
    - Default is 'every_week' for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_sailing_days' AND column_name = 'frequency'
  ) THEN
    ALTER TABLE club_sailing_days ADD COLUMN frequency text NOT NULL DEFAULT 'every_week';
  END IF;
END $$;
