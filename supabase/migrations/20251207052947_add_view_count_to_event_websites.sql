/*
  # Add view count to event websites

  1. Changes
    - Adds view_count column to event_websites table
    - Default value is 0
    - Used to track page views for event websites

  2. Security
    - No RLS changes needed
*/

-- Add view_count column to event_websites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_websites' AND column_name = 'view_count'
  ) THEN
    ALTER TABLE event_websites ADD COLUMN view_count integer DEFAULT 0;
  END IF;
END $$;