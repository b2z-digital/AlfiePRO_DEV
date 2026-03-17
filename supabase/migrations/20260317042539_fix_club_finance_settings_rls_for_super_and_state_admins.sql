/*
  # Fix club_finance_settings RLS policies

  The existing policy only allows club admins (role = 'admin') to manage finance settings.
  This fix adds access for:
    - Super admins
    - State association admins
    - Club editors

  1. Security Changes
    - Replace "Club admins can manage finance settings" with broader policy
    - Add separate super admin policy
    - Add state admin policy
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Club admins can manage finance settings" ON club_finance_settings;

-- Recreate with broader club-level access (admin + editor)
CREATE POLICY "Club admins and editors can manage finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_finance_settings.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = club_finance_settings.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Super admins can manage all finance settings
CREATE POLICY "Super admins can manage all finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    )
  );

-- State admins can manage finance settings for clubs in their state
CREATE POLICY "State admins can manage club finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    )
  );

-- Also fix tax_rates table which has the same issue
DROP POLICY IF EXISTS "Club admins can manage tax rates" ON tax_rates;

CREATE POLICY "Club admins and editors can manage tax rates"
  ON tax_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = tax_rates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = tax_rates.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Super admins can manage all tax rates"
  ON tax_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'super_admin'
    )
  );

CREATE POLICY "State admins can manage club tax rates"
  ON tax_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role = 'state_admin'
    )
  );
