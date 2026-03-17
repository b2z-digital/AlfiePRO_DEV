/*
  # Fix finance RLS policies to use correct helper functions

  The previous migration used user_clubs role checks for super_admin and state_admin,
  but super admins don't have user_clubs entries. This fix uses the correct
  helper functions: is_platform_super_admin() and user_is_association_admin_for_club().

  1. Tables Fixed
    - `club_finance_settings` - super admin and state admin policies
    - `tax_rates` - super admin and state admin policies
    - `invoices` - add super admin and state admin access

  2. Security Changes
    - Use is_platform_super_admin() for super admin checks
    - Use user_is_association_admin_for_club() for state/national admin checks
*/

-- ============================================
-- Fix club_finance_settings policies
-- ============================================

-- Drop the broken policies from previous migration
DROP POLICY IF EXISTS "Super admins can manage all finance settings" ON club_finance_settings;
DROP POLICY IF EXISTS "State admins can manage club finance settings" ON club_finance_settings;

-- Super admins using the correct helper function
CREATE POLICY "Super admins can manage all club finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Association admins (state + national) using the correct helper function
CREATE POLICY "Association admins can manage club finance settings"
  ON club_finance_settings
  FOR ALL
  TO authenticated
  USING (user_is_association_admin_for_club(club_id, auth.uid()))
  WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));

-- ============================================
-- Fix tax_rates policies
-- ============================================

-- Drop the broken policies from previous migration
DROP POLICY IF EXISTS "Super admins can manage all tax rates" ON tax_rates;
DROP POLICY IF EXISTS "State admins can manage club tax rates" ON tax_rates;

-- Super admins using the correct helper function
CREATE POLICY "Super admins can manage all tax rates"
  ON tax_rates
  FOR ALL
  TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- ============================================
-- Fix invoices policies
-- ============================================

-- Add super admin access to invoices (needed for invoice number conflict check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoices' AND policyname = 'Super admins can manage all invoices'
  ) THEN
    CREATE POLICY "Super admins can manage all invoices"
      ON invoices
      FOR ALL
      TO authenticated
      USING (is_platform_super_admin())
      WITH CHECK (is_platform_super_admin());
  END IF;
END $$;

-- Add association admin access to invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoices' AND policyname = 'Association admins can manage club invoices'
  ) THEN
    CREATE POLICY "Association admins can manage club invoices"
      ON invoices
      FOR ALL
      TO authenticated
      USING (user_is_association_admin_for_club(club_id, auth.uid()))
      WITH CHECK (user_is_association_admin_for_club(club_id, auth.uid()));
  END IF;
END $$;
