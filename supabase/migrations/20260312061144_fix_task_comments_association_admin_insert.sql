
/*
  # Fix task_comments INSERT policy for association admins

  ## Problem
  The existing INSERT policy on task_comments only allows users who are members
  of the task's club (via user_clubs). However, tasks can also belong to state
  associations (state_association_id) or national associations (national_association_id).
  State and national admins could view and create tasks but received "Failed to add comment"
  errors because the comment INSERT policy didn't account for association-based tasks.

  ## Changes
  - Add INSERT policy for state admins to comment on state association tasks
  - Add INSERT policy for national admins to comment on national association tasks
  - Add SELECT policies so association admins can view comments on their tasks
  - Also allow the task assignee and creator to comment on any task they are involved with
*/

-- Allow state admins to add comments on tasks belonging to their state association
CREATE POLICY "State admins can add comments on their tasks"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_state_associations usa ON usa.state_association_id = ct.state_association_id
      WHERE ct.id = task_comments.task_id
        AND ct.state_association_id IS NOT NULL
        AND usa.user_id = (SELECT auth.uid())
    )
  );

-- Allow national admins to add comments on tasks belonging to their national association
CREATE POLICY "National admins can add comments on their tasks"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_national_associations una ON una.national_association_id = ct.national_association_id
      WHERE ct.id = task_comments.task_id
        AND ct.national_association_id IS NOT NULL
        AND una.user_id = (SELECT auth.uid())
    )
  );

-- Allow the task assignee to add comments on tasks assigned to them
CREATE POLICY "Task assignees can add comments"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM club_tasks ct
      WHERE ct.id = task_comments.task_id
        AND ct.assignee_id = (SELECT auth.uid())
    )
  );

-- Allow the task creator to add comments on tasks they created
CREATE POLICY "Task creators can add comments"
  ON task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM club_tasks ct
      WHERE ct.id = task_comments.task_id
        AND ct.created_by = (SELECT auth.uid())
    )
  );

-- Allow state admins to view comments on their association tasks
CREATE POLICY "State admins can view comments on their tasks"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_state_associations usa ON usa.state_association_id = ct.state_association_id
      WHERE ct.id = task_comments.task_id
        AND ct.state_association_id IS NOT NULL
        AND usa.user_id = (SELECT auth.uid())
    )
  );

-- Allow national admins to view comments on their association tasks
CREATE POLICY "National admins can view comments on their tasks"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      JOIN user_national_associations una ON una.national_association_id = ct.national_association_id
      WHERE ct.id = task_comments.task_id
        AND ct.national_association_id IS NOT NULL
        AND una.user_id = (SELECT auth.uid())
    )
  );

-- Allow task assignees to view comments on their assigned tasks
CREATE POLICY "Task assignees can view comments"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      WHERE ct.id = task_comments.task_id
        AND ct.assignee_id = (SELECT auth.uid())
    )
  );

-- Allow task creators to view comments on tasks they created
CREATE POLICY "Task creators can view comments"
  ON task_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_tasks ct
      WHERE ct.id = task_comments.task_id
        AND ct.created_by = (SELECT auth.uid())
    )
  );
