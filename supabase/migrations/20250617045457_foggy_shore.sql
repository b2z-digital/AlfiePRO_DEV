/*
  # Fix event attendance foreign key relationship

  1. Changes
    - Update the foreign key constraint for event_attendance.user_id to properly reference auth.users
    - This will allow Supabase to understand the relationship for joins

  2. Security
    - No changes to existing RLS policies
*/

-- Drop the existing foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_attendance_user_id_fkey' 
    AND table_name = 'event_attendance'
  ) THEN
    ALTER TABLE event_attendance DROP CONSTRAINT event_attendance_user_id_fkey;
  END IF;
END $$;

-- Add the correct foreign key constraint referencing auth.users
ALTER TABLE event_attendance 
ADD CONSTRAINT event_attendance_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;