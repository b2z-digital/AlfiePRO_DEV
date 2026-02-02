/*
  # Fix meeting_agenda_id foreign key constraint to work with RLS

  1. Problem
    - The foreign key constraint on club_tasks.meeting_agenda_id fails silently
    - PostgreSQL FK checks can't see through RLS policies on meeting_agendas
    - This causes meeting_agenda_id to be set to NULL on insert

  2. Solution
    - Drop the existing foreign key constraint
    - Create a trigger-based validation that uses SECURITY DEFINER
    - This allows the validation to bypass RLS and verify the agenda exists

  3. Changes
    - Drop club_tasks_meeting_agenda_id_fkey constraint
    - Create validate_meeting_agenda_fkey() function with SECURITY DEFINER
    - Add trigger to validate meeting_agenda_id on insert/update
*/

-- Drop the existing foreign key constraint
ALTER TABLE club_tasks 
DROP CONSTRAINT IF EXISTS club_tasks_meeting_agenda_id_fkey;

-- Create a function to validate the foreign key with SECURITY DEFINER
CREATE OR REPLACE FUNCTION validate_meeting_agenda_fkey()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If meeting_agenda_id is NULL, allow it
  IF NEW.meeting_agenda_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the meeting_agenda exists (bypasses RLS with SECURITY DEFINER)
  IF NOT EXISTS (
    SELECT 1 FROM meeting_agendas 
    WHERE id = NEW.meeting_agenda_id
  ) THEN
    RAISE EXCEPTION 'meeting_agenda_id references non-existent meeting agenda';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to validate the foreign key
DROP TRIGGER IF EXISTS validate_meeting_agenda_fkey_trigger ON club_tasks;
CREATE TRIGGER validate_meeting_agenda_fkey_trigger
  BEFORE INSERT OR UPDATE ON club_tasks
  FOR EACH ROW
  EXECUTE FUNCTION validate_meeting_agenda_fkey();

-- Add a comment explaining this approach
COMMENT ON FUNCTION validate_meeting_agenda_fkey() IS 
'Validates meeting_agenda_id foreign key using SECURITY DEFINER to bypass RLS. 
This is necessary because standard FK constraints fail silently when the referenced table has RLS enabled.';
