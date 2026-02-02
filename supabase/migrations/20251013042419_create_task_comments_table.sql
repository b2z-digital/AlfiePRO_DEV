/*
  # Create task comments table

  1. New Tables
    - `task_comments`
      - `id` (uuid, primary key)
      - `task_id` (uuid, foreign key to club_tasks)
      - `user_id` (uuid, foreign key to auth.users)
      - `comment` (text, the comment content)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `task_comments` table
    - Add policy for authenticated users to read comments for tasks they can access
    - Add policy for authenticated users to create comments
    - Add policy for comment authors to update their own comments
    - Add policy for comment authors to delete their own comments
*/

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES club_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read comments for tasks in their clubs"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      INNER JOIN user_clubs uc ON ct.club_id = uc.club_id
      WHERE ct.id = task_comments.task_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create comments"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM club_tasks ct
      INNER JOIN user_clubs uc ON ct.club_id = uc.club_id
      WHERE ct.id = task_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own comments"
  ON task_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON task_comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);