/*
  # Fix meetings table RLS policy performance

  The meetings table has 18 RLS policies with complex nested queries.
  When updating a meeting (e.g., completing minutes), all SELECT policies
  are evaluated alongside UPDATE policies, causing cascading RLS evaluation
  through committee_positions (13 policies), user_clubs, clubs, etc.

  ## Solution
  Create SECURITY DEFINER helper functions for the meetings table to avoid
  the RLS cascade, and replace the UPDATE/DELETE policies with simpler versions.
  
  SELECT policies are kept as-is since reads are less time-critical and
  the main issue is with the write operations blocking the UI.

  ## Changes
  1. New function: user_can_edit_meeting(meeting_id, user_id)
  2. Replaced UPDATE and DELETE policies on meetings to use the helper
*/

-- Helper: Check if user can edit a meeting
CREATE OR REPLACE FUNCTION public.user_can_edit_meeting(p_meeting_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_state_association_id uuid;
  v_national_association_id uuid;
BEGIN
  SELECT club_id, state_association_id, national_association_id
  INTO v_club_id, v_state_association_id, v_national_association_id
  FROM meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
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

-- Replace meetings UPDATE policies
DROP POLICY IF EXISTS "Admins/Editors can update club meetings" ON meetings;
DROP POLICY IF EXISTS "National admins can update their meetings" ON meetings;
DROP POLICY IF EXISTS "State admins can update their meetings" ON meetings;

CREATE POLICY "Admins can update meetings"
  ON meetings FOR UPDATE
  TO authenticated
  USING (user_can_edit_meeting(id, auth.uid()))
  WITH CHECK (user_can_edit_meeting(id, auth.uid()));

-- Replace meetings DELETE policies
DROP POLICY IF EXISTS "Admins/Editors can delete club meetings" ON meetings;
DROP POLICY IF EXISTS "National admins can delete their meetings" ON meetings;
DROP POLICY IF EXISTS "State admins can delete their meetings" ON meetings;

CREATE POLICY "Admins can delete meetings"
  ON meetings FOR DELETE
  TO authenticated
  USING (user_can_edit_meeting(id, auth.uid()));
