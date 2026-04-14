/*
  # Fix duplicate meeting attendance records per user

  1. Changes
    - Remove duplicate meeting_attendance records, keeping the most recent one per user per meeting
    - Add a unique constraint on (meeting_id, user_id) to prevent future duplicates
    - Update any records missing member_id where a newer record has it

  2. Important Notes
    - The existing UNIQUE (meeting_id, member_id) constraint does not prevent duplicates 
      when member_id is NULL (since NULL != NULL in SQL)
    - This migration adds the correct constraint on user_id which is always populated
*/

-- First, for users with duplicate records, keep the latest one and update it with member_id if available
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT meeting_id, user_id
    FROM meeting_attendance
    WHERE user_id IS NOT NULL
    GROUP BY meeting_id, user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Get the member_id from any record that has one
    DECLARE
      best_member_id uuid;
      keep_id uuid;
    BEGIN
      SELECT member_id INTO best_member_id
      FROM meeting_attendance
      WHERE meeting_id = dup.meeting_id AND user_id = dup.user_id AND member_id IS NOT NULL
      LIMIT 1;

      -- Keep the most recent record
      SELECT id INTO keep_id
      FROM meeting_attendance
      WHERE meeting_id = dup.meeting_id AND user_id = dup.user_id
      ORDER BY created_at DESC
      LIMIT 1;

      -- Update the kept record with member_id if it's missing
      IF best_member_id IS NOT NULL THEN
        UPDATE meeting_attendance SET member_id = best_member_id WHERE id = keep_id;
      END IF;

      -- Delete all other duplicates
      DELETE FROM meeting_attendance
      WHERE meeting_id = dup.meeting_id
        AND user_id = dup.user_id
        AND id != keep_id;
    END;
  END LOOP;
END $$;

-- Add unique constraint on (meeting_id, user_id) to prevent future duplicates
ALTER TABLE meeting_attendance
  ADD CONSTRAINT meeting_attendance_meeting_id_user_id_key UNIQUE (meeting_id, user_id);
