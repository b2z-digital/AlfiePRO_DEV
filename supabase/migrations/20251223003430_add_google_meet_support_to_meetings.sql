/*
  # Add Google Meet Support to Meetings

  Add support for online and hybrid meetings with Google Meet integration

  ## Changes

  1. Add meeting_type column to meetings table
     - 'in_person' - Physical meeting only
     - 'online' - Google Meet only
     - 'hybrid' - Both physical and online

  2. Add google_calendar_event_id column
     - Stores the Google Calendar event ID for syncing

  3. Add google_calendar_event_link column
     - Direct link to the event in Google Calendar
*/

-- Add meeting_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'meeting_type'
  ) THEN
    ALTER TABLE meetings ADD COLUMN meeting_type text DEFAULT 'in_person'
    CHECK (meeting_type IN ('in_person', 'online', 'hybrid'));
  END IF;
END $$;

-- Add google_calendar_event_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'google_calendar_event_id'
  ) THEN
    ALTER TABLE meetings ADD COLUMN google_calendar_event_id text;
  END IF;
END $$;

-- Add google_calendar_event_link column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'google_calendar_event_link'
  ) THEN
    ALTER TABLE meetings ADD COLUMN google_calendar_event_link text;
  END IF;
END $$;

-- Create index for calendar event lookups
CREATE INDEX IF NOT EXISTS idx_meetings_google_calendar_event_id
  ON meetings(google_calendar_event_id);