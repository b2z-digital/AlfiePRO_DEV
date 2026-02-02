/*
  # Add Table Board Structure (Monday.com Style)

  This migration adds support for Monday.com-style table boards with:
  - Task groups (collapsible sections of tasks)
  - Custom columns with different types (Status, Text, Person, Date, Numbers, etc.)
  - Column data storage for each task

  ## New Tables

  ### `event_task_groups`
  Grouping of tasks within a board (like Monday.com groups)
  
  ### `event_board_columns`
  Custom columns for table boards
  
  ### `event_task_column_data`
  Stores the actual data for each task's columns

  ## Table Modifications

  - Add `group_id` to club_tasks table
  - Add `position_in_group` to club_tasks table
*/

-- Create task groups table
CREATE TABLE IF NOT EXISTS event_task_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES event_task_boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6',
  position integer NOT NULL DEFAULT 0,
  is_collapsed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create board columns table
CREATE TABLE IF NOT EXISTS event_board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES event_task_boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  column_type text NOT NULL CHECK (column_type IN ('status', 'text', 'person', 'date', 'number', 'dropdown', 'checkbox', 'timeline', 'files', 'priority')),
  position integer NOT NULL DEFAULT 0,
  width integer DEFAULT 150,
  settings jsonb DEFAULT '{}',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create task column data table
CREATE TABLE IF NOT EXISTS event_task_column_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES club_tasks(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES event_board_columns(id) ON DELETE CASCADE,
  value jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(task_id, column_id)
);

-- Add group_id to club_tasks if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'club_tasks'
    AND column_name = 'group_id'
  ) THEN
    ALTER TABLE club_tasks ADD COLUMN group_id uuid REFERENCES event_task_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add position_in_group to club_tasks if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'club_tasks'
    AND column_name = 'position_in_group'
  ) THEN
    ALTER TABLE club_tasks ADD COLUMN position_in_group integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_task_groups_board_id ON event_task_groups(board_id);
CREATE INDEX IF NOT EXISTS idx_event_task_groups_position ON event_task_groups(board_id, position);
CREATE INDEX IF NOT EXISTS idx_event_board_columns_board_id ON event_board_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_event_board_columns_position ON event_board_columns(board_id, position);
CREATE INDEX IF NOT EXISTS idx_event_task_column_data_task_id ON event_task_column_data(task_id);
CREATE INDEX IF NOT EXISTS idx_event_task_column_data_column_id ON event_task_column_data(column_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_group_id ON club_tasks(group_id);

-- Enable RLS
ALTER TABLE event_task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_task_column_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_task_groups
CREATE POLICY "Users can view groups from their boards"
  ON event_task_groups FOR SELECT
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create groups in their boards"
  ON event_task_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update groups in their boards"
  ON event_task_groups FOR UPDATE
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete groups from their boards"
  ON event_task_groups FOR DELETE
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for event_board_columns
CREATE POLICY "Users can view columns from their boards"
  ON event_board_columns FOR SELECT
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create columns in their boards"
  ON event_board_columns FOR INSERT
  TO authenticated
  WITH CHECK (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update columns in their boards"
  ON event_board_columns FOR UPDATE
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete columns from their boards"
  ON event_board_columns FOR DELETE
  TO authenticated
  USING (
    board_id IN (
      SELECT id FROM event_task_boards
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for event_task_column_data
CREATE POLICY "Users can view task column data"
  ON event_task_column_data FOR SELECT
  TO authenticated
  USING (
    task_id IN (
      SELECT id FROM club_tasks
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create task column data"
  ON event_task_column_data FOR INSERT
  TO authenticated
  WITH CHECK (
    task_id IN (
      SELECT id FROM club_tasks
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update task column data"
  ON event_task_column_data FOR UPDATE
  TO authenticated
  USING (
    task_id IN (
      SELECT id FROM club_tasks
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete task column data"
  ON event_task_column_data FOR DELETE
  TO authenticated
  USING (
    task_id IN (
      SELECT id FROM club_tasks
      WHERE club_id IN (SELECT club_id FROM user_clubs WHERE user_id = auth.uid())
         OR state_association_id IN (SELECT state_association_id FROM user_state_associations WHERE user_id = auth.uid())
         OR national_association_id IN (SELECT national_association_id FROM user_national_associations WHERE user_id = auth.uid())
    )
  );

-- Add updated_at trigger for groups
CREATE OR REPLACE FUNCTION update_event_task_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_event_task_groups_updated_at
  BEFORE UPDATE ON event_task_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_event_task_groups_updated_at();

-- Add updated_at trigger for columns
CREATE OR REPLACE FUNCTION update_event_board_columns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_event_board_columns_updated_at
  BEFORE UPDATE ON event_board_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_event_board_columns_updated_at();

-- Add updated_at trigger for column data
CREATE OR REPLACE FUNCTION update_event_task_column_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_event_task_column_data_updated_at
  BEFORE UPDATE ON event_task_column_data
  FOR EACH ROW
  EXECUTE FUNCTION update_event_task_column_data_updated_at();
