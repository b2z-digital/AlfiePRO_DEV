/*
  # Fix event_attendance to allow viewing all club members' attendance
  
  1. Changes
    - Add club_id column to event_attendance table (nullable first)
    - Populate club_id from related events
    - Delete any orphaned records that can't be linked
    - Make club_id NOT NULL
    - Fix RLS policy to allow viewing all club event attendance
  
  2. Security
    - Users can view attendance for any event in clubs they belong to
    - Users still can only create/update/delete their own attendance records
*/

-- Add club_id column if it doesn't exist (nullable first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_attendance' AND column_name = 'club_id'
  ) THEN
    ALTER TABLE event_attendance ADD COLUMN club_id uuid REFERENCES clubs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Populate club_id for existing records from quick_races
UPDATE event_attendance ea
SET club_id = qr.club_id
FROM quick_races qr
WHERE ea.event_id = qr.id
AND ea.club_id IS NULL
AND ea.series_id IS NULL;

-- Populate club_id for existing records from race_series
UPDATE event_attendance ea
SET club_id = rs.club_id
FROM race_series rs
WHERE ea.series_id = rs.id
AND ea.club_id IS NULL;

-- Populate club_id for existing records from public_events
UPDATE event_attendance ea
SET club_id = pe.club_id
FROM public_events pe
WHERE ea.event_id = pe.id
AND ea.club_id IS NULL
AND ea.series_id IS NULL;

-- Delete any orphaned records that couldn't be linked to a club
DELETE FROM event_attendance WHERE club_id IS NULL;

-- Make club_id NOT NULL after populating
DO $$
BEGIN
  ALTER TABLE event_attendance ALTER COLUMN club_id SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- If there are still NULL values, don't fail the migration
    RAISE NOTICE 'Could not set club_id to NOT NULL - some records may still have NULL values';
END $$;

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can read their own attendance" ON event_attendance;
DROP POLICY IF EXISTS "Users can view attendance for club events" ON event_attendance;
DROP POLICY IF EXISTS "Users can view all attendance for club events" ON event_attendance;

-- Create new policy to allow viewing all attendance for club events
CREATE POLICY "Users can view all attendance for club events"
  ON event_attendance
  FOR SELECT
  TO authenticated
  USING (
    club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = event_attendance.club_id
    )
  );

-- Create index on club_id for performance
CREATE INDEX IF NOT EXISTS idx_event_attendance_club_id ON event_attendance(club_id);
