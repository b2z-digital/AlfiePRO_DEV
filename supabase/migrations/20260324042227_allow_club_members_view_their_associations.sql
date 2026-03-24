/*
  # Allow club members to view their associations

  1. Changes
    - Add SELECT policy on `state_associations` for club members whose club belongs to that state
    - Add SELECT policy on `national_associations` for club members whose club's state belongs to that national

  2. Reason
    - Club members need to read their state association to resolve the national_association_id
    - This is required for the News page to show national and state articles to club members
*/

CREATE POLICY "Club members can view their state association"
  ON state_associations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_clubs uc ON uc.club_id = c.id
      WHERE c.state_association_id = state_associations.id
        AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club members can view their national association"
  ON national_associations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN state_associations sa ON sa.id = c.state_association_id
      JOIN user_clubs uc ON uc.club_id = c.id
      WHERE sa.national_association_id = national_associations.id
        AND uc.user_id = auth.uid()
    )
  );