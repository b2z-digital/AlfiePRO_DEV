/*
  # Fix State Club Fees RLS Policies

  1. Changes
    - Drop existing policies that lack schema qualification
    - Recreate policies with proper public. schema prefix
    - Ensures RLS checks work correctly for state association admins

  2. Security
    - State association admins can manage fee structures for their associations
    - Proper schema qualification prevents RLS failures
*/

-- Drop existing policies
DROP POLICY IF EXISTS "State admins can view club fees" ON public.state_association_club_fees;
DROP POLICY IF EXISTS "State admins can create club fees" ON public.state_association_club_fees;
DROP POLICY IF EXISTS "State admins can update club fees" ON public.state_association_club_fees;
DROP POLICY IF EXISTS "State admins can delete club fees" ON public.state_association_club_fees;

-- Recreate with proper schema qualification

-- State association admins can view their fee structures
CREATE POLICY "State admins can view club fees"
  ON public.state_association_club_fees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can create fee structures
CREATE POLICY "State admins can create club fees"
  ON public.state_association_club_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can update their fee structures
CREATE POLICY "State admins can update club fees"
  ON public.state_association_club_fees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );

-- State association admins can delete their fee structures
CREATE POLICY "State admins can delete club fees"
  ON public.state_association_club_fees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations
      WHERE user_state_associations.state_association_id = state_association_club_fees.state_association_id
      AND user_state_associations.user_id = auth.uid()
      AND user_state_associations.role = 'admin'
    )
  );
