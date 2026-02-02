/*
  # Race Document Scheduling System

  1. Schema Changes
    - Add `document_status` to public_events table
      - Values: 'not_required', 'pending', 'scheduled', 'completed'
    - Add `document_scheduled_task_ids` jsonb field to track task IDs
    - Add `document_contacts` jsonb field to store responsible contacts
    - Add `event_id` field to club_tasks to link tasks to events
    - Add `task_type` field to club_tasks to categorize tasks

  2. New Functions
    - Function to calculate document due date (2 months before event)
    - Function to check if event requires documents

  3. Security
    - Update RLS policies as needed
    - Ensure proper access control for document scheduling
*/

-- Add document tracking fields to public_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'document_status'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN document_status text DEFAULT 'not_required'
    CHECK (document_status IN ('not_required', 'pending', 'scheduled', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'document_scheduled_task_ids'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN document_scheduled_task_ids jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'document_contacts'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN document_contacts jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add event linking and task type to club_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE public.club_tasks
    ADD COLUMN event_id uuid REFERENCES public.public_events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE public.club_tasks
    ADD COLUMN task_type text DEFAULT 'general'
    CHECK (task_type IN ('general', 'document_nor', 'document_si', 'document_other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'contributors'
  ) THEN
    ALTER TABLE public.club_tasks
    ADD COLUMN contributors jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create index for event_id lookups
CREATE INDEX IF NOT EXISTS idx_club_tasks_event_id ON public.club_tasks(event_id);

-- Function to calculate document due date (2 months before event)
CREATE OR REPLACE FUNCTION public.calculate_document_due_date(event_date date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return 2 months (60 days) before the event date
  RETURN event_date - INTERVAL '60 days';
END;
$$;

-- Function to check if event requires documents based on event level
CREATE OR REPLACE FUNCTION public.event_requires_documents(event_level text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- State and National events require documents
  RETURN event_level IN ('state', 'national');
END;
$$;

-- Function to create race document tasks
CREATE OR REPLACE FUNCTION public.create_race_document_task(
  p_event_id uuid,
  p_club_id uuid,
  p_task_type text,
  p_due_date date,
  p_assignee_id uuid,
  p_contributors jsonb,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_event_name text;
  v_task_title text;
  v_task_description text;
BEGIN
  -- Get event name
  SELECT event_name INTO v_event_name
  FROM public.public_events
  WHERE id = p_event_id;

  -- Create task title and description based on type
  CASE p_task_type
    WHEN 'document_nor' THEN
      v_task_title := 'Create Notice of Race (NOR) - ' || v_event_name;
      v_task_description := 'Create and upload the Notice of Race (NOR) document for ' || v_event_name || '. This document is required for state/national events and must be completed before the event.';
    WHEN 'document_si' THEN
      v_task_title := 'Create Sailing Instructions (SI) - ' || v_event_name;
      v_task_description := 'Create and upload the Sailing Instructions (SI) document for ' || v_event_name || '. This document is required for state/national events and must be completed before the event.';
    ELSE
      v_task_title := 'Create Race Documents - ' || v_event_name;
      v_task_description := 'Create and upload race documents for ' || v_event_name || '.';
  END CASE;

  -- Create the task
  INSERT INTO public.club_tasks (
    title,
    description,
    due_date,
    status,
    priority,
    assignee_id,
    club_id,
    created_by,
    event_id,
    task_type,
    contributors,
    send_reminder,
    reminder_type
  )
  VALUES (
    v_task_title,
    v_task_description,
    p_due_date,
    'pending',
    'high',
    p_assignee_id,
    p_club_id,
    p_created_by,
    p_event_id,
    p_task_type,
    p_contributors,
    true,
    'both'
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

-- Add RLS policy for viewing event-related tasks (public can see for public events)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'club_tasks' AND policyname = 'Public can view tasks for public events'
  ) THEN
    CREATE POLICY "Public can view tasks for public events" ON public.club_tasks
      FOR SELECT TO public
      USING (
        event_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.public_events pe
          WHERE pe.id = club_tasks.event_id
          AND pe.approval_status = 'approved'
        )
      );
  END IF;
END $$;

-- Comment on new columns
COMMENT ON COLUMN public.public_events.document_status IS 'Status of race documents: not_required, pending, scheduled, completed';
COMMENT ON COLUMN public.public_events.document_scheduled_task_ids IS 'Array of task IDs for scheduled document creation';
COMMENT ON COLUMN public.public_events.document_contacts IS 'Array of contacts responsible for document creation';
COMMENT ON COLUMN public.club_tasks.event_id IS 'Links task to a specific event';
COMMENT ON COLUMN public.club_tasks.task_type IS 'Type of task: general, document_nor, document_si, document_other';
COMMENT ON COLUMN public.club_tasks.contributors IS 'Array of user IDs who are contributors to this task';
