/*
  # Add Meeting Category and Recurrence Support

  1. Modified Tables
    - `meetings`
      - `meeting_category` (text) - 'general' or 'committee' to control member visibility
      - `recurrence_type` (text) - 'none', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'
      - `recurrence_end_date` (date) - when the recurring series ends
      - `recurrence_parent_id` (uuid) - links generated instances back to the parent meeting
      - `recurrence_index` (integer) - the ordinal position in the series (0 = parent)

  2. Security
    - No RLS changes needed (existing policies cover new columns)

  3. Notes
    - meeting_category defaults to 'general' for backwards compatibility
    - recurrence_type defaults to 'none'
    - recurrence_parent_id is self-referencing FK to meetings(id) ON DELETE CASCADE
    - When a recurring meeting is created, individual meeting instances are generated
      as separate rows so each functions independently with its own agenda, minutes, etc.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'meeting_category'
  ) THEN
    ALTER TABLE meetings ADD COLUMN meeting_category text DEFAULT 'general'
      CHECK (meeting_category IN ('general', 'committee'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'recurrence_type'
  ) THEN
    ALTER TABLE meetings ADD COLUMN recurrence_type text DEFAULT 'none'
      CHECK (recurrence_type IN ('none', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'recurrence_end_date'
  ) THEN
    ALTER TABLE meetings ADD COLUMN recurrence_end_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'recurrence_parent_id'
  ) THEN
    ALTER TABLE meetings ADD COLUMN recurrence_parent_id uuid REFERENCES meetings(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'recurrence_index'
  ) THEN
    ALTER TABLE meetings ADD COLUMN recurrence_index integer DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_recurrence_parent ON meetings(recurrence_parent_id);
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_category ON meetings(meeting_category);
