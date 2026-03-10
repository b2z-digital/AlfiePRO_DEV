/*
  # Add Association Committee Support

  1. Modified Tables
    - `committee_position_definitions`
      - `state_association_id` (uuid, nullable) - Links position to a state association
      - `national_association_id` (uuid, nullable) - Links position to a national association
      - `club_id` is now nullable (was NOT NULL) to allow association-only positions
    - `committee_positions`
      - `state_association_id` (uuid, nullable) - Links assignment to a state association
      - `national_association_id` (uuid, nullable) - Links assignment to a national association
      - `club_id` is now nullable (was NOT NULL) to allow association-only assignments

  2. Security
    - RLS policies for association admins to manage their committee positions
    - State admins can manage state association committee
    - National admins can manage national association committee

  3. Important Notes
    - Existing club data is unchanged (club_id remains populated for all existing rows)
    - A position belongs to exactly ONE of: club, state association, or national association
    - Indexes added for efficient lookups by association ID
*/

-- Make club_id nullable on committee_position_definitions
ALTER TABLE committee_position_definitions ALTER COLUMN club_id DROP NOT NULL;

-- Add association columns to committee_position_definitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_position_definitions' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE committee_position_definitions ADD COLUMN state_association_id uuid REFERENCES state_associations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_position_definitions' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE committee_position_definitions ADD COLUMN national_association_id uuid REFERENCES national_associations(id);
  END IF;
END $$;

-- Make club_id nullable on committee_positions
ALTER TABLE committee_positions ALTER COLUMN club_id DROP NOT NULL;

-- Add association columns to committee_positions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE committee_positions ADD COLUMN state_association_id uuid REFERENCES state_associations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE committee_positions ADD COLUMN national_association_id uuid REFERENCES national_associations(id);
  END IF;
END $$;

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_committee_position_defs_state_assoc 
  ON committee_position_definitions(state_association_id) WHERE state_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_committee_position_defs_national_assoc 
  ON committee_position_definitions(national_association_id) WHERE national_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_committee_positions_state_assoc 
  ON committee_positions(state_association_id) WHERE state_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_committee_positions_national_assoc 
  ON committee_positions(national_association_id) WHERE national_association_id IS NOT NULL;

-- RLS policies for state admins to manage association committee position definitions
CREATE POLICY "State admins can view state association committee position definitions"
  ON committee_position_definitions
  FOR SELECT
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

CREATE POLICY "State admins can insert state association committee position definitions"
  ON committee_position_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can update state association committee position definitions"
  ON committee_position_definitions
  FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can delete state association committee position definitions"
  ON committee_position_definitions
  FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_position_definitions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

-- RLS policies for national admins to manage national association committee position definitions
CREATE POLICY "National admins can view national association committee position definitions"
  ON committee_position_definitions
  FOR SELECT
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

CREATE POLICY "National admins can insert national association committee position definitions"
  ON committee_position_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "National admins can update national association committee position definitions"
  ON committee_position_definitions
  FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "National admins can delete national association committee position definitions"
  ON committee_position_definitions
  FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_position_definitions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  );

-- RLS policies for state admins to manage association committee position assignments
CREATE POLICY "State admins can view state association committee positions"
  ON committee_positions
  FOR SELECT
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
    )
  );

CREATE POLICY "State admins can insert state association committee positions"
  ON committee_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can update state association committee positions"
  ON committee_positions
  FOR UPDATE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "State admins can delete state association committee positions"
  ON committee_positions
  FOR DELETE
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = committee_positions.state_association_id
      AND usa.user_id = auth.uid()
      AND usa.role IN ('admin', 'owner')
    )
  );

-- RLS policies for national admins to manage national association committee position assignments
CREATE POLICY "National admins can view national association committee positions"
  ON committee_positions
  FOR SELECT
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  );

CREATE POLICY "National admins can insert national association committee positions"
  ON committee_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "National admins can update national association committee positions"
  ON committee_positions
  FOR UPDATE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
      AND una.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "National admins can delete national association committee positions"
  ON committee_positions
  FOR DELETE
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = committee_positions.national_association_id
      AND una.user_id = auth.uid()
    )
  );
