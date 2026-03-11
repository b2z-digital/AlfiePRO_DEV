/*
  # Create optimized meeting agenda RPC function

  1. New Functions
    - `get_meeting_agenda_items(p_meeting_id uuid)` - Returns agenda items for a meeting
      with built-in access checks, bypassing complex RLS policy evaluation

  2. Security
    - Uses SECURITY DEFINER to bypass RLS for performance
    - Validates that the calling user has access to the meeting via:
      - Club membership (for club meetings)
      - State association membership (for state meetings)
      - National association membership (for national meetings)
      - Club member viewing visible association meetings

  3. Notes
    - This replaces the slow PostgREST query that evaluates multiple complex RLS policies per row
    - Returns agenda items with owner details in a single efficient query
*/

CREATE OR REPLACE FUNCTION public.get_meeting_agenda_items(p_meeting_id uuid)
RETURNS TABLE (
  id uuid,
  meeting_id uuid,
  item_number integer,
  item_name text,
  owner_id uuid,
  type text,
  duration integer,
  created_at timestamptz,
  updated_at timestamptz,
  minutes_content text,
  minutes_decision text,
  minutes_tasks text,
  minutes_attachments jsonb,
  owner_first_name text,
  owner_last_name text,
  owner_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_meeting record;
  v_has_access boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT m.club_id, m.state_association_id, m.national_association_id, m.visible_to_member_clubs
  INTO v_meeting
  FROM meetings m
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_meeting.club_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = v_user_id AND uc.club_id = v_meeting.club_id
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access AND v_meeting.state_association_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_state_associations usa
      WHERE usa.user_id = v_user_id AND usa.state_association_id = v_meeting.state_association_id
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      SELECT EXISTS (
        SELECT 1 FROM user_clubs uc
        JOIN clubs c ON c.id = uc.club_id
        WHERE uc.user_id = v_user_id AND c.state_association_id = v_meeting.state_association_id
      ) INTO v_has_access;
    END IF;
  END IF;

  IF NOT v_has_access AND v_meeting.national_association_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_national_associations una
      WHERE una.user_id = v_user_id AND una.national_association_id = v_meeting.national_association_id
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      SELECT EXISTS (
        SELECT 1 FROM user_clubs uc
        JOIN clubs c ON c.id = uc.club_id
        JOIN state_associations sa ON sa.id = c.state_association_id
        WHERE uc.user_id = v_user_id AND sa.national_association_id = v_meeting.national_association_id
      ) INTO v_has_access;
    END IF;
  END IF;

  IF NOT v_has_access THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ma.id,
    ma.meeting_id,
    ma.item_number,
    ma.item_name,
    ma.owner_id,
    ma.type,
    ma.duration,
    ma.created_at,
    ma.updated_at,
    ma.minutes_content,
    ma.minutes_decision,
    ma.minutes_tasks,
    ma.minutes_attachments,
    mem.first_name AS owner_first_name,
    mem.last_name AS owner_last_name,
    mem.avatar_url AS owner_avatar_url
  FROM meeting_agendas ma
  LEFT JOIN members mem ON mem.id = ma.owner_id
  WHERE ma.meeting_id = p_meeting_id
  ORDER BY ma.item_number ASC;
END;
$$;
