/*
  # Tasks Schema

  1. New Tables
    - `club_tasks` - Stores tasks for clubs
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `description` (text)
      - `due_date` (date)
      - `status` (text, default 'pending')
      - `priority` (text, default 'medium')
      - `assignee_id` (uuid, references profiles)
      - `club_id` (uuid, references clubs)
      - `created_by` (uuid, references auth.users)
      - Various other task-related fields
    - `task_attachments` - Stores attachments for tasks
      - `id` (uuid, primary key)
      - `task_id` (uuid, references club_tasks)
      - `name` (text)
      - `url` (text)
      - Various other attachment-related fields
  
  2. Security
    - Enable RLS on both tables
    - Add policies for viewing, creating, updating, and deleting tasks and attachments
*/

-- Create club_tasks table
CREATE TABLE IF NOT EXISTS club_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid REFERENCES profiles(id),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  completed_at timestamptz,
  repeat_type text DEFAULT 'none' CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  repeat_end_date date,
  send_reminder boolean DEFAULT false,
  reminder_type text CHECK (reminder_type IN ('email', 'notification', 'both')),
  reminder_date timestamptz,
  followers jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create task_attachments table
CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES club_tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  type text,
  size integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_tasks_club_id ON club_tasks(club_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_assignee_id ON club_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_due_date ON club_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_club_tasks_status ON club_tasks(status);
CREATE INDEX IF NOT EXISTS idx_club_tasks_created_by ON club_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);

-- Enable RLS
ALTER TABLE club_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for club_tasks

-- Club members can view tasks for their clubs
CREATE POLICY "Club members can view tasks" ON club_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = club_tasks.club_id 
      AND uc.user_id = auth.uid()
    )
  );

-- Club admins and editors can create tasks
CREATE POLICY "Club admins/editors can create tasks" ON club_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = club_tasks.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Club admins and editors can update tasks
CREATE POLICY "Club admins/editors can update tasks" ON club_tasks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = club_tasks.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = club_tasks.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Task assignees can update their own tasks
CREATE POLICY "Assignees can update their tasks" ON club_tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- Club admins and editors can delete tasks
CREATE POLICY "Club admins/editors can delete tasks" ON club_tasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc 
      WHERE uc.club_id = club_tasks.club_id 
      AND uc.user_id = auth.uid() 
      AND uc.role IN ('admin', 'editor')
    )
  );

-- RLS Policies for task_attachments

-- Users can view attachments for tasks they can see
CREATE POLICY "Users can view task attachments" ON task_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_attachments.task_id
      AND uc.user_id = auth.uid()
    )
  );

-- Users can create attachments for tasks they can edit
CREATE POLICY "Users can create task attachments" ON task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_attachments.task_id
      AND uc.user_id = auth.uid()
      AND (uc.role IN ('admin', 'editor') OR ct.assignee_id = auth.uid())
    )
  );

-- Users can delete attachments for tasks they can edit
CREATE POLICY "Users can delete task attachments" ON task_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_attachments.task_id
      AND uc.user_id = auth.uid()
      AND (uc.role IN ('admin', 'editor') OR ct.assignee_id = auth.uid())
    )
  );

-- Create updated_at trigger for club_tasks
CREATE TRIGGER update_club_tasks_updated_at
  BEFORE UPDATE ON club_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
