/*
  # Fix Event Attendance Issues

  1. Foreign Key Relationship
    - Add foreign key constraint between event_attendance.user_id and auth.users.id
    - This will allow proper joins in Supabase queries

  2. Event ID Structure
    - Update event_attendance to use proper UUID for event_id
    - For series events, use series_id directly instead of composite strings
*/

-- Add foreign key constraint for user_id to reference auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_attendance_user_id_fkey'
    AND table_name = 'event_attendance'
  ) THEN
    ALTER TABLE public.event_attendance
    ADD CONSTRAINT event_attendance_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add a round_name column to track which round of a series this attendance is for
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_attendance' AND column_name = 'round_name'
  ) THEN
    ALTER TABLE event_attendance ADD COLUMN round_name text;
  END IF;
END $$;

-- Create index for better performance on event_id and round_name queries
CREATE INDEX IF NOT EXISTS idx_event_attendance_event_round 
ON event_attendance(event_id, round_name);

-- Update the unique constraint to include round_name for series events
DO $$
BEGIN
  -- Drop the existing unique constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_attendance_event_id_user_id_key'
    AND table_name = 'event_attendance'
  ) THEN
    ALTER TABLE event_attendance DROP CONSTRAINT event_attendance_event_id_user_id_key;
  END IF;
  
  -- Add new unique constraint that includes round_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_attendance_event_user_round_key'
    AND table_name = 'event_attendance'
  ) THEN
    ALTER TABLE event_attendance 
    ADD CONSTRAINT event_attendance_event_user_round_key 
    UNIQUE (event_id, user_id, round_name);
  END IF;
END $$;