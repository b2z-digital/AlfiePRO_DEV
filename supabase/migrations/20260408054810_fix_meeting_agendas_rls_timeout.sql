/*
  # Fix meeting_agendas RLS timeout

  The meeting_agendas table UPDATE/SELECT operations were timing out because
  RLS policies created a deep cascade:
  - meeting_agendas policies query meetings table (18 RLS policies)
  - meetings policies query committee_positions (13 RLS policies)
  - Each nested table evaluation triggers its own full RLS evaluation

  ## Solution
  Create SECURITY DEFINER helper functions that bypass RLS on intermediate
  tables, then replace the meeting_agendas policies with simpler versions
  that call these functions.

  ## Changes
  1. New function: user_can_edit_meeting_agenda(agenda_id, user_id)
  2. New function: user_can_view_meeting_agenda(agenda_id, user_id)
  3. Replaced all 13 meeting_agendas RLS policies with 4 simple ones
*/

-- Helper: Check if user can edit a meeting agenda (admin/editor of the club, or association admin)
CREATE OR REPLACE FUNCTION public.user_can_edit_meeting_agenda(p_agenda_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
  v_club_id uuid;
  v_state_association_id uuid;
  v_national_association_id uuid;
BEGIN
  SELECT m.id, m.club_id, m.state_association_id, m.national_association_id
  INTO v_meeting_id, v_club_id, v_state_association_id, v_national_association_id
  FROM meeting_agendas ma
  JOIN meetings m ON m.id = ma.meeting_id
  WHERE ma.id = p_agenda_id;

  IF v_meeting_id IS NULL THEN
    RETURN false;
  END IF;

  -- Club admin/editor check
  IF v_club_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = v_club_id
        AND uc.user_id = p_user_id
        AND uc.role IN ('admin', 'editor')
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- State admin check
  IF v_state_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = v_state_association_id
        AND usa.user_id = p_user_id
        AND usa.role = 'state_admin'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- National admin check
  IF v_national_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = v_national_association_id
        AND una.user_id = p_user_id
        AND una.role = 'national_admin'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Helper: Check if user can view a meeting agenda
CREATE OR REPLACE FUNCTION public.user_can_view_meeting_agenda(p_agenda_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting_id uuid;
  v_club_id uuid;
  v_state_association_id uuid;
  v_national_association_id uuid;
  v_visible_to_member_clubs boolean;
  v_meeting_category text;
BEGIN
  SELECT m.id, m.club_id, m.state_association_id, m.national_association_id,
         m.visible_to_member_clubs, m.meeting_category
  INTO v_meeting_id, v_club_id, v_state_association_id, v_national_association_id,
       v_visible_to_member_clubs, v_meeting_category
  FROM meeting_agendas ma
  JOIN meetings m ON m.id = ma.meeting_id
  WHERE ma.id = p_agenda_id;

  IF v_meeting_id IS NULL THEN
    RETURN false;
  END IF;

  -- Club member check
  IF v_club_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = v_club_id
        AND uc.user_id = p_user_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- State association user check
  IF v_state_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.state_association_id = v_state_association_id
        AND usa.user_id = p_user_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- National association user check
  IF v_national_association_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.national_association_id = v_national_association_id
        AND una.user_id = p_user_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Visible to member clubs (association meetings shared with clubs)
  IF v_visible_to_member_clubs = true THEN
    -- State association meeting visible to member clubs
    IF v_state_association_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM clubs c
        JOIN user_clubs uc ON uc.club_id = c.id
        WHERE c.state_association_id = v_state_association_id
          AND uc.user_id = p_user_id
      ) THEN
        RETURN true;
      END IF;
    END IF;

    -- National association meeting visible to member clubs
    IF v_national_association_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM clubs c
        JOIN state_associations sa ON sa.id = c.state_association_id
        JOIN user_clubs uc ON uc.club_id = c.id
        WHERE sa.national_association_id = v_national_association_id
          AND uc.user_id = p_user_id
      ) THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Drop all existing meeting_agendas policies
DROP POLICY IF EXISTS "Admins/Editors can add meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "Admins/Editors can delete meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "Admins/Editors can update meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "Club members view agendas for visible association meetings" ON meeting_agendas;
DROP POLICY IF EXISTS "National admins can add meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "National admins can delete meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "National admins can update meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "National association users can view meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "State admins can add meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "State admins can delete meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "State admins can update meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "State association users can view meeting agendas" ON meeting_agendas;
DROP POLICY IF EXISTS "Users can view meeting agendas" ON meeting_agendas;

-- Create simplified policies using helper functions
CREATE POLICY "Users can view meeting agendas"
  ON meeting_agendas FOR SELECT
  TO authenticated
  USING (user_can_view_meeting_agenda(id, auth.uid()));

CREATE POLICY "Admins can insert meeting agendas"
  ON meeting_agendas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_agendas.meeting_id
        AND (
          (m.club_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_clubs uc
            WHERE uc.club_id = m.club_id AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'editor')
          ))
          OR (m.state_association_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_state_associations usa
            WHERE usa.state_association_id = m.state_association_id AND usa.user_id = auth.uid() AND usa.role = 'state_admin'
          ))
          OR (m.national_association_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_national_associations una
            WHERE una.national_association_id = m.national_association_id AND una.user_id = auth.uid() AND una.role = 'national_admin'
          ))
        )
    )
  );

CREATE POLICY "Admins can update meeting agendas"
  ON meeting_agendas FOR UPDATE
  TO authenticated
  USING (user_can_edit_meeting_agenda(id, auth.uid()))
  WITH CHECK (user_can_edit_meeting_agenda(id, auth.uid()));

CREATE POLICY "Admins can delete meeting agendas"
  ON meeting_agendas FOR DELETE
  TO authenticated
  USING (user_can_edit_meeting_agenda(id, auth.uid()));
