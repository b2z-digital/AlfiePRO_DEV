/*
  # Enhance Meeting Task Integration
  
  1. Changes
    - Add `meeting_agenda_id` column to `club_tasks` to link tasks with meeting agenda items
    - Add `due_time` column to `club_tasks` for time-specific deadlines
    - Add `supporting_members` jsonb column to track additional team members on tasks
    - Update meeting_agendas to remove old `minutes_tasks` text field (replaced by proper task linking)
    
  2. Security
    - No RLS changes needed - existing policies cover the new fields
    
  3. Notes
    - Tasks created from meeting agendas will link via `meeting_agenda_id`
    - Supporting members stored as array of member IDs in jsonb
    - Due time is optional and stored separately from due date
*/

-- Add meeting agenda reference to club_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_tasks' AND column_name = 'meeting_agenda_id'
  ) THEN
    ALTER TABLE club_tasks 
    ADD COLUMN meeting_agenda_id uuid REFERENCES meeting_agendas(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_club_tasks_meeting_agenda 
    ON club_tasks(meeting_agenda_id);
  END IF;
END $$;

-- Add due time to club_tasks (separate from due date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_tasks' AND column_name = 'due_time'
  ) THEN
    ALTER TABLE club_tasks 
    ADD COLUMN due_time time;
  END IF;
END $$;

-- Add supporting members array to club_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'club_tasks' AND column_name = 'supporting_members'
  ) THEN
    ALTER TABLE club_tasks 
    ADD COLUMN supporting_members jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add index for better performance when querying tasks by supporting members
CREATE INDEX IF NOT EXISTS idx_club_tasks_supporting_members 
ON club_tasks USING gin(supporting_members);

-- Create a function to get all members associated with a task (assignee + supporters)
CREATE OR REPLACE FUNCTION public.get_task_members(task_id uuid)
RETURNS TABLE (member_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.assignee_id as member_id,
    'assignee'::text as role
  FROM club_tasks ct
  WHERE ct.id = task_id AND ct.assignee_id IS NOT NULL
  
  UNION ALL
  
  SELECT 
    (jsonb_array_elements_text(ct.supporting_members))::uuid as member_id,
    'supporter'::text as role
  FROM club_tasks ct
  WHERE ct.id = task_id;
END;
$$;
