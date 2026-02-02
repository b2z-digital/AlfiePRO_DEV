/*
  # Task Reminder Tracking Fields

  1. Schema Changes
    - Add `last_reminder_sent` timestamp to club_tasks
    - Add `reminder_schedule` jsonb to track reminder history

  2. Security
    - Update existing RLS policies as needed
*/

-- Add reminder tracking fields to club_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'last_reminder_sent'
  ) THEN
    ALTER TABLE public.club_tasks
    ADD COLUMN last_reminder_sent timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'reminder_schedule'
  ) THEN
    ALTER TABLE public.club_tasks
    ADD COLUMN reminder_schedule jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_club_tasks_reminders
  ON public.club_tasks(due_date, status, send_reminder)
  WHERE send_reminder = true AND due_date IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN public.club_tasks.last_reminder_sent IS 'Timestamp of last reminder email sent for this task';
COMMENT ON COLUMN public.club_tasks.reminder_schedule IS 'JSON object tracking reminder history: {week: timestamp, three_days: timestamp, due_date: timestamp, overdue: [timestamps]}';
