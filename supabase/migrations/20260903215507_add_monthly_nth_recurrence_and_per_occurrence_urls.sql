/*
  # Add monthly nth-weekday recurrence and per-occurrence meeting URLs

  1. Schema Changes
    - Add 'monthly_nth' to recurrence_type CHECK constraint
    - Add recurrence_nth_week (integer 1-5) — which week of the month (1st, 2nd, 3rd, 4th, last)
    - Add recurrence_nth_day (integer 0-6) — day of the week (0=Sunday, 6=Saturday)

  2. Notes
    - monthly_nth allows patterns like "2nd Tuesday of every month"
    - nth_week=5 means "last" occurrence of that weekday in the month
    - Existing 'monthly' stays unchanged (same date each month)
    - conferencing_url on child meetings is now set independently (handled in app code)
*/

-- Widen recurrence_type CHECK to include 'monthly_nth'
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_recurrence_type_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_recurrence_type_check
  CHECK (recurrence_type IN ('none', 'weekly', 'fortnightly', 'monthly', 'monthly_nth', 'quarterly', 'yearly'));

-- Add nth-weekday columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'recurrence_nth_week') THEN
    ALTER TABLE meetings ADD COLUMN recurrence_nth_week integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'recurrence_nth_day') THEN
    ALTER TABLE meetings ADD COLUMN recurrence_nth_day integer;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
