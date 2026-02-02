/*
  # Simplify Member Invitations RLS Policies
  
  ## Overview
  Temporarily simplify RLS policies to allow any authenticated user to manage
  member invitations until user_clubs table is properly populated.
  
  ## Changes
  - Drop existing restrictive policies
  - Create simple policies that allow authenticated users to manage invitations
  - Keep public read-only policy for token-based signup
  
  ## Security Note
  This is a temporary solution. Proper club-based access control should be
  implemented once user_clubs table is populated.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Club admins and creators can view invitations" ON member_invitations;
DROP POLICY IF EXISTS "Club admins and creators can create invitations" ON member_invitations;
DROP POLICY IF EXISTS "Club admins and creators can update invitations" ON member_invitations;
DROP POLICY IF EXISTS "Club admins can view applications" ON membership_applications;
DROP POLICY IF EXISTS "Club admins can update applications" ON membership_applications;

-- Create simpler policies for member_invitations

-- Any authenticated user can view invitations (temporary)
CREATE POLICY "Authenticated users can view invitations" ON member_invitations
  FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can create invitations (temporary)
CREATE POLICY "Authenticated users can create invitations" ON member_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Any authenticated user can update invitations (temporary)
CREATE POLICY "Authenticated users can update invitations" ON member_invitations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Keep public read-only policy for token-based signup
-- (This policy should already exist from previous migration)

-- Create simpler policies for membership_applications

-- Any authenticated user can view applications (temporary)
CREATE POLICY "Authenticated users can view applications" ON membership_applications
  FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can update applications (temporary)
CREATE POLICY "Authenticated users can update applications" ON membership_applications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Keep existing policies for user's own applications
-- (These should already exist from previous migration)
