/*
  # Allow association committee members to view their association meetings

  1. Changes
    - Add SELECT policy for state association committee members to view all meetings for their association
    - Add SELECT policy for national association committee members to view all meetings for their association

  2. Security
    - Only grants access to users who hold a committee position for the specific association
    - Covers both general and committee meetings so committee members can see everything relevant

  3. Notes
    - Previously, only users in `user_state_associations` (state admins) could view state association meetings
    - Committee members (e.g., Secretary) who are not state admins had no matching SELECT policy
    - This fixes the issue where committee members couldn't see any meetings on the association calendar
*/

CREATE POLICY "State association committee members can view meetings"
  ON public.meetings
  FOR SELECT
  TO authenticated
  USING (
    state_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.committee_positions cp
      WHERE cp.state_association_id = meetings.state_association_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "National association committee members can view meetings"
  ON public.meetings
  FOR SELECT
  TO authenticated
  USING (
    national_association_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.committee_positions cp
      WHERE cp.national_association_id = meetings.national_association_id
        AND cp.user_id = auth.uid()
    )
  );
