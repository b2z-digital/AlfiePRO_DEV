/*
  # Fix National State Fees RLS Policies - Correct Role Name

  1. Changes
    - Update policies to check for 'national_admin' role instead of 'admin'
    - This matches the actual role stored in user_national_associations table

  2. Security
    - National association admins (with national_admin role) can manage fee structures
*/

-- Drop existing policies
DROP POLICY IF EXISTS "National admins can view state fees" ON public.national_association_state_fees;
DROP POLICY IF EXISTS "National admins can create state fees" ON public.national_association_state_fees;
DROP POLICY IF EXISTS "National admins can update state fees" ON public.national_association_state_fees;
DROP POLICY IF EXISTS "National admins can delete state fees" ON public.national_association_state_fees;

-- Recreate with correct role name

-- National association admins can view their fee structures
CREATE POLICY "National admins can view state fees"
  ON public.national_association_state_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    )
  );

-- National association admins can create fee structures
CREATE POLICY "National admins can create state fees"
  ON public.national_association_state_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    )
  );

-- National association admins can update their fee structures
CREATE POLICY "National admins can update state fees"
  ON public.national_association_state_fees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    )
  );

-- National association admins can delete their fee structures
CREATE POLICY "National admins can delete state fees"
  ON public.national_association_state_fees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations
      WHERE user_national_associations.national_association_id = national_association_state_fees.national_association_id
      AND user_national_associations.user_id = auth.uid()
      AND user_national_associations.role = 'national_admin'
    )
  );
