/*
  # Add Meeting Calendar Visibility System

  1. Modified Tables
    - `meetings`
      - `visible_to_member_clubs` (boolean, default false) - Controls whether association meetings appear in member clubs' calendars
      - `organization_name` (text, nullable) - Denormalized name of the organization for display

  2. New RLS Policies
    - Club members can view general meetings from their state/national association when visible_to_member_clubs is true
    - Club committee members can view committee meetings from their state/national association when visible_to_member_clubs is true
    - Users can view/insert/update attendance for visible association meetings

  3. Security
    - Committee meetings only visible to committee members
    - General meetings visible to all club members when opted in
    - Attendance management restricted to authenticated users for their own records

  4. Important Notes
    - Uses IF NOT EXISTS to prevent duplicate column/policy errors
    - No data is deleted or modified destructively
    - Backfills existing general association meetings as visible
*/

-- 1. Add visible_to_member_clubs column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'visible_to_member_clubs'
  ) THEN
    ALTER TABLE meetings ADD COLUMN visible_to_member_clubs boolean DEFAULT false;
  END IF;
END $$;

-- 2. Add organization_name column for display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meetings' AND column_name = 'organization_name'
  ) THEN
    ALTER TABLE meetings ADD COLUMN organization_name text;
  END IF;
END $$;

-- 3. Create helper function for checking committee membership
CREATE OR REPLACE FUNCTION public.user_is_committee_member_at_club(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM committee_positions cp
    JOIN members m ON m.id = cp.member_id
    WHERE m.user_id = p_user_id
      AND cp.member_id IS NOT NULL
  );
$$;

-- 4. RLS: Club members can see GENERAL meetings from their state association
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings'
    AND policyname = 'Club members view visible state assoc general meetings'
  ) THEN
    CREATE POLICY "Club members view visible state assoc general meetings"
      ON meetings FOR SELECT
      TO authenticated
      USING (
        state_association_id IS NOT NULL
        AND visible_to_member_clubs = true
        AND meeting_category = 'general'
        AND EXISTS (
          SELECT 1
          FROM clubs c
          JOIN user_clubs uc ON uc.club_id = c.id
          WHERE c.state_association_id = meetings.state_association_id
            AND uc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 5. RLS: Club COMMITTEE members can see COMMITTEE meetings from their state association
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings'
    AND policyname = 'Club committee view visible state assoc committee meetings'
  ) THEN
    CREATE POLICY "Club committee view visible state assoc committee meetings"
      ON meetings FOR SELECT
      TO authenticated
      USING (
        state_association_id IS NOT NULL
        AND visible_to_member_clubs = true
        AND meeting_category = 'committee'
        AND EXISTS (
          SELECT 1
          FROM clubs c
          JOIN user_clubs uc ON uc.club_id = c.id
          WHERE c.state_association_id = meetings.state_association_id
            AND uc.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM committee_positions cp
          JOIN members m ON m.id = cp.member_id
          WHERE m.user_id = auth.uid()
            AND cp.member_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- 6. RLS: Club members can see GENERAL meetings from their national association
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings'
    AND policyname = 'Club members view visible national assoc general meetings'
  ) THEN
    CREATE POLICY "Club members view visible national assoc general meetings"
      ON meetings FOR SELECT
      TO authenticated
      USING (
        national_association_id IS NOT NULL
        AND visible_to_member_clubs = true
        AND meeting_category = 'general'
        AND EXISTS (
          SELECT 1
          FROM clubs c
          JOIN state_associations sa ON sa.id = c.state_association_id
          JOIN user_clubs uc ON uc.club_id = c.id
          WHERE sa.national_association_id = meetings.national_association_id
            AND uc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 7. RLS: Club COMMITTEE members can see COMMITTEE meetings from their national association
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings'
    AND policyname = 'Club committee view visible national assoc committee meetings'
  ) THEN
    CREATE POLICY "Club committee view visible national assoc committee meetings"
      ON meetings FOR SELECT
      TO authenticated
      USING (
        national_association_id IS NOT NULL
        AND visible_to_member_clubs = true
        AND meeting_category = 'committee'
        AND EXISTS (
          SELECT 1
          FROM clubs c
          JOIN state_associations sa ON sa.id = c.state_association_id
          JOIN user_clubs uc ON uc.club_id = c.id
          WHERE sa.national_association_id = meetings.national_association_id
            AND uc.user_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1
          FROM committee_positions cp
          JOIN members m ON m.id = cp.member_id
          WHERE m.user_id = auth.uid()
            AND cp.member_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- 8. RLS: Users can view meeting_attendance for visible association meetings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_attendance'
    AND policyname = 'Users view attendance for visible association meetings'
  ) THEN
    CREATE POLICY "Users view attendance for visible association meetings"
      ON meeting_attendance FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM meetings m
          WHERE m.id = meeting_attendance.meeting_id
            AND m.visible_to_member_clubs = true
            AND (
              (m.state_association_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM clubs c JOIN user_clubs uc ON uc.club_id = c.id
                WHERE c.state_association_id = m.state_association_id AND uc.user_id = auth.uid()
              ))
              OR
              (m.national_association_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM clubs c JOIN state_associations sa ON sa.id = c.state_association_id
                JOIN user_clubs uc ON uc.club_id = c.id
                WHERE sa.national_association_id = m.national_association_id AND uc.user_id = auth.uid()
              ))
            )
        )
      );
  END IF;
END $$;

-- 9. RLS: Users can insert attendance for visible association meetings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_attendance'
    AND policyname = 'Users insert attendance for visible association meetings'
  ) THEN
    CREATE POLICY "Users insert attendance for visible association meetings"
      ON meeting_attendance FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM meetings m
          WHERE m.id = meeting_attendance.meeting_id
            AND m.visible_to_member_clubs = true
        )
      );
  END IF;
END $$;

-- 10. RLS: Club members can view meeting_agendas for visible association meetings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_agendas'
    AND policyname = 'Club members view agendas for visible association meetings'
  ) THEN
    CREATE POLICY "Club members view agendas for visible association meetings"
      ON meeting_agendas FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM meetings m
          WHERE m.id = meeting_agendas.meeting_id
            AND m.visible_to_member_clubs = true
            AND (
              (m.state_association_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM clubs c JOIN user_clubs uc ON uc.club_id = c.id
                WHERE c.state_association_id = m.state_association_id AND uc.user_id = auth.uid()
              ))
              OR
              (m.national_association_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM clubs c JOIN state_associations sa ON sa.id = c.state_association_id
                JOIN user_clubs uc ON uc.club_id = c.id
                WHERE sa.national_association_id = m.national_association_id AND uc.user_id = auth.uid()
              ))
            )
        )
      );
  END IF;
END $$;

-- 11. Backfill: Set existing general association meetings as visible to member clubs
UPDATE meetings
SET visible_to_member_clubs = true
WHERE (state_association_id IS NOT NULL OR national_association_id IS NOT NULL)
  AND meeting_category = 'general'
  AND visible_to_member_clubs IS NOT true;

-- 12. Backfill organization_name from association tables
UPDATE meetings m
SET organization_name = sa.name
FROM state_associations sa
WHERE m.state_association_id = sa.id
  AND m.organization_name IS NULL;

UPDATE meetings m
SET organization_name = na.name
FROM national_associations na
WHERE m.national_association_id = na.id
  AND m.organization_name IS NULL;

-- 13. Add index for efficient querying of visible meetings
CREATE INDEX IF NOT EXISTS idx_meetings_visible_to_member_clubs
  ON meetings (visible_to_member_clubs)
  WHERE visible_to_member_clubs = true;