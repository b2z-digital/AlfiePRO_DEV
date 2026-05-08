/*
  # Fix support_session_requests table columns

  1. Modified Tables
    - `support_session_requests`
      - Added `call_id` (text, nullable) - stores the call identifier used by the frontend
      - Made `club_id` nullable - the frontend doesn't always have club context available

  2. Notes
    - The frontend component inserts `call_id` which was missing from the schema
    - The frontend doesn't always provide `club_id`, causing inserts to fail
    - These fixes ensure support session requests can be created successfully during calls
*/

-- Add call_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_session_requests' AND column_name = 'call_id'
  ) THEN
    ALTER TABLE support_session_requests ADD COLUMN call_id text;
  END IF;
END $$;

-- Make club_id nullable
ALTER TABLE support_session_requests ALTER COLUMN club_id DROP NOT NULL;
