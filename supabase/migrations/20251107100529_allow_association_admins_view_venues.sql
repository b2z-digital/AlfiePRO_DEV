/*
  # Allow Association Admins to View Member Club Venues

  This migration adds RLS policies to allow state and national association admins
  to view venues from all clubs under their associations.

  ## Changes

  1. Add policy for state association admins to view venues from member clubs
  2. Add policy for national association admins to view venues from member clubs

  ## Security

  - State admins can only view venues from clubs in their state association
  - National admins can only view venues from clubs in their national association
  - Existing club member access is preserved
*/

-- Add policy for state association admins to view venues from member clubs
CREATE POLICY "State association admins can view member club venues"
  ON venues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      INNER JOIN clubs c ON c.state_association_id = usa.state_association_id
      WHERE c.id = venues.club_id
      AND usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- Add policy for national association admins to view venues from member clubs
-- National admins access clubs through state associations
CREATE POLICY "National association admins can view member club venues"
  ON venues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      INNER JOIN state_associations sa ON sa.national_association_id = una.national_association_id
      INNER JOIN clubs c ON c.state_association_id = sa.id
      WHERE c.id = venues.club_id
      AND una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );