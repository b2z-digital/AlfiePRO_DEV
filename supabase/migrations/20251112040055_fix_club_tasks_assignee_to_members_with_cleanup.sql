/*
  # Fix club_tasks assignee to reference members table
  
  1. Changes
    - Clean up invalid assignee_id references
    - Drop the existing foreign key constraint on assignee_id that references profiles
    - Add new foreign key constraint on assignee_id that references members
    - This allows meeting tasks to be properly assigned to club members
    
  2. Security
    - No RLS policy changes needed
    - Existing policies will work with the new constraint
*/

-- First, set assignee_id to NULL for any tasks with invalid member references
UPDATE club_tasks 
SET assignee_id = NULL 
WHERE assignee_id IS NOT NULL 
AND NOT EXISTS (
  SELECT 1 FROM members WHERE members.id = club_tasks.assignee_id
);

-- Drop the old foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'club_tasks_assignee_id_fkey'
    AND table_name = 'club_tasks'
  ) THEN
    ALTER TABLE club_tasks DROP CONSTRAINT club_tasks_assignee_id_fkey;
  END IF;
END $$;

-- Add new foreign key constraint pointing to members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'club_tasks_assignee_id_fkey_members'
    AND table_name = 'club_tasks'
  ) THEN
    ALTER TABLE club_tasks 
    ADD CONSTRAINT club_tasks_assignee_id_fkey_members 
    FOREIGN KEY (assignee_id) 
    REFERENCES members(id) 
    ON DELETE SET NULL;
  END IF;
END $$;
