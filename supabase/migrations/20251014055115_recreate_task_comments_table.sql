/*
  # Recreate task comments table with proper setup

  1. New Tables
    - `task_comments`
      - `id` (uuid, primary key)
      - `task_id` (uuid, foreign key to club_tasks)
      - `user_id` (uuid, foreign key to profiles)
      - `comment` (text, the comment content)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `task_comments` table
    - Club members can view comments on tasks in their club
    - Club members can add comments to tasks in their club
    - Users can update/delete their own comments
    - Admins/editors can delete any comments in their club
*/

-- Create task_comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES club_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read comments for tasks in their clubs" ON task_comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON task_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON task_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON task_comments;
DROP POLICY IF EXISTS "Club members can view task comments" ON task_comments;
DROP POLICY IF EXISTS "Club members can add task comments" ON task_comments;
DROP POLICY IF EXISTS "Users can update own task comments" ON task_comments;
DROP POLICY IF EXISTS "Users can delete own task comments" ON task_comments;
DROP POLICY IF EXISTS "Admins/editors can delete task comments" ON task_comments;

-- Club members can view comments on tasks in their club
CREATE POLICY "Club members can view task comments"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_comments.task_id
      AND uc.user_id = auth.uid()
    )
  );

-- Club members can add comments to tasks in their club
CREATE POLICY "Club members can add task comments"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_comments.task_id
      AND uc.user_id = auth.uid()
    )
  );

-- Users can update their own comments
CREATE POLICY "Users can update own task comments"
  ON task_comments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own task comments"
  ON task_comments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Club admins/editors can delete any task comments in their club
CREATE POLICY "Admins/editors can delete task comments"
  ON task_comments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_clubs uc ON uc.club_id = ct.club_id
      WHERE ct.id = task_comments.task_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );
