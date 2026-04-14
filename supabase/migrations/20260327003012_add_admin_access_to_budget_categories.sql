/*
  # Add super admin and association admin access to budget categories

  1. Changes
    - Adds SELECT policy for super admins to view all budget categories
    - Adds ALL policy for super admins to manage all budget categories
    - Adds SELECT policy for state association admins to view budget categories
      of clubs in their state association
    - Adds ALL policy for state association admins to manage budget categories
      of clubs in their state association
    - Adds SELECT policy for national association admins to view budget categories
      of clubs in their national association (via state associations)

  2. Security
    - Super admins: full access to all club budget categories
    - State admins: full access to categories for clubs in their state association
    - National admins: full access to categories for clubs under their national association
    - Uses existing helper functions (is_super_admin, user_has_association_access)

  3. Important Notes
    - Fixes issue where state/national/super admins could not see budget categories
      when viewing a club they don't directly belong to via user_clubs
    - Existing policies for club admins and members remain unchanged
*/

-- Super admins can view all budget categories
CREATE POLICY "Super admins can view all budget categories"
  ON budget_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Super admins can manage all budget categories
CREATE POLICY "Super admins can manage budget categories"
  ON budget_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- State association admins can view budget categories for clubs in their association
CREATE POLICY "State admins can view club budget categories"
  ON budget_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      JOIN clubs c ON c.state_association_id = usa.state_association_id
      WHERE c.id = budget_categories.club_id
      AND usa.user_id = auth.uid()
    )
  );

-- State association admins can manage budget categories for clubs in their association
CREATE POLICY "State admins can manage club budget categories"
  ON budget_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      JOIN clubs c ON c.state_association_id = usa.state_association_id
      WHERE c.id = budget_categories.club_id
      AND usa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_state_associations usa
      JOIN clubs c ON c.state_association_id = usa.state_association_id
      WHERE c.id = budget_categories.club_id
      AND usa.user_id = auth.uid()
    )
  );

-- National association admins can view budget categories for clubs under their national association
CREATE POLICY "National admins can view club budget categories"
  ON budget_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      JOIN state_associations sa ON sa.national_association_id = una.national_association_id
      JOIN clubs c ON c.state_association_id = sa.id
      WHERE c.id = budget_categories.club_id
      AND una.user_id = auth.uid()
    )
  );

-- National association admins can manage budget categories for clubs under their national association
CREATE POLICY "National admins can manage club budget categories"
  ON budget_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      JOIN state_associations sa ON sa.national_association_id = una.national_association_id
      JOIN clubs c ON c.state_association_id = sa.id
      WHERE c.id = budget_categories.club_id
      AND una.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_national_associations una
      JOIN state_associations sa ON sa.national_association_id = una.national_association_id
      JOIN clubs c ON c.state_association_id = sa.id
      WHERE c.id = budget_categories.club_id
      AND una.user_id = auth.uid()
    )
  );