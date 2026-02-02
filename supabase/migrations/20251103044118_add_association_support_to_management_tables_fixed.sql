/*
  # Add Association Support to Management Tables

  1. Changes to meetings table
    - Add state_association_id (nullable, FK to state_associations)
    - Add national_association_id (nullable, FK to national_associations)
    - Make club_id nullable (allow meetings for associations)

  2. Changes to club_tasks table
    - Add state_association_id (nullable, FK to state_associations)
    - Add national_association_id (nullable, FK to national_associations)
    - Make club_id nullable (allow tasks for associations)

  3. Indexes and RLS policies
*/

-- Add association columns to meetings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE meetings ADD COLUMN state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE meetings ADD COLUMN national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE meetings ALTER COLUMN club_id DROP NOT NULL;
END $$;

-- Add association columns to club_tasks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE club_tasks ADD COLUMN state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_tasks' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE club_tasks ADD COLUMN national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE;
  END IF;

  ALTER TABLE club_tasks ALTER COLUMN club_id DROP NOT NULL;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meetings_state_association ON meetings(state_association_id);
CREATE INDEX IF NOT EXISTS idx_meetings_national_association ON meetings(national_association_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_state_association ON club_tasks(state_association_id);
CREATE INDEX IF NOT EXISTS idx_club_tasks_national_association ON club_tasks(national_association_id);

-- RLS Policies for meetings (state)
DROP POLICY IF EXISTS "State admins can view their meetings" ON meetings;
CREATE POLICY "State admins can view their meetings"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = meetings.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can create meetings" ON meetings;
CREATE POLICY "State admins can create meetings"
  ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = meetings.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

DROP POLICY IF EXISTS "State admins can update their meetings" ON meetings;
CREATE POLICY "State admins can update their meetings"
  ON meetings FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = meetings.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

DROP POLICY IF EXISTS "State admins can delete their meetings" ON meetings;
CREATE POLICY "State admins can delete their meetings"
  ON meetings FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = meetings.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- RLS Policies for meetings (national)
DROP POLICY IF EXISTS "National admins can view their meetings" ON meetings;
CREATE POLICY "National admins can view their meetings"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = meetings.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can create meetings" ON meetings;
CREATE POLICY "National admins can create meetings"
  ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = meetings.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

DROP POLICY IF EXISTS "National admins can update their meetings" ON meetings;
CREATE POLICY "National admins can update their meetings"
  ON meetings FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = meetings.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

DROP POLICY IF EXISTS "National admins can delete their meetings" ON meetings;
CREATE POLICY "National admins can delete their meetings"
  ON meetings FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = meetings.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- RLS Policies for club_tasks (state)
DROP POLICY IF EXISTS "State admins can view their tasks" ON club_tasks;
CREATE POLICY "State admins can view their tasks"
  ON club_tasks FOR SELECT
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = club_tasks.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "State admins can create tasks" ON club_tasks;
CREATE POLICY "State admins can create tasks"
  ON club_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = club_tasks.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

DROP POLICY IF EXISTS "State admins can update their tasks" ON club_tasks;
CREATE POLICY "State admins can update their tasks"
  ON club_tasks FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = club_tasks.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

DROP POLICY IF EXISTS "State admins can delete their tasks" ON club_tasks;
CREATE POLICY "State admins can delete their tasks"
  ON club_tasks FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = club_tasks.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- RLS Policies for club_tasks (national)
DROP POLICY IF EXISTS "National admins can view their tasks" ON club_tasks;
CREATE POLICY "National admins can view their tasks"
  ON club_tasks FOR SELECT
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = club_tasks.national_association_id
      AND una.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "National admins can create tasks" ON club_tasks;
CREATE POLICY "National admins can create tasks"
  ON club_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = club_tasks.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

DROP POLICY IF EXISTS "National admins can update their tasks" ON club_tasks;
CREATE POLICY "National admins can update their tasks"
  ON club_tasks FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = club_tasks.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

DROP POLICY IF EXISTS "National admins can delete their tasks" ON club_tasks;
CREATE POLICY "National admins can delete their tasks"
  ON club_tasks FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = club_tasks.national_association_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );