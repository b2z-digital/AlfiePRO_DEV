/*
  # Add Association Admin Access to Members
  
  State and national association admins need to view members from clubs under their associations.
  This migration adds RLS policies to allow this access.
*/

-- Allow state association admins to view members from clubs under their state
CREATE POLICY "State admins can view members in their state"
  ON members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM clubs c
      JOIN user_state_associations usa ON usa.state_association_id = c.state_association_id
      WHERE c.id = members.club_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
    )
  );

-- Allow national association admins to view all members under their national association
CREATE POLICY "National admins can view members in their national association"
  ON members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM clubs c
      JOIN state_associations sa ON sa.id = c.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE c.id = members.club_id
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
    )
  );
