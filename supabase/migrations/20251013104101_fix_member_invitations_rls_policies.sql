/*
  # Fix Member Invitations RLS Policies
  
  ## Overview
  Updates RLS policies for member_invitations to allow club creators/owners to manage invitations,
  in addition to users in the user_clubs table with admin role.
  
  ## Changes
  - Drop existing restrictive policies
  - Create new policies that check BOTH user_clubs admin role AND clubs.created_by_user_id
  - This ensures club creators can always manage invitations for their clubs
  
  ## Security
  - Maintains security by checking club ownership
  - Users can only manage invitations for clubs they own or admin
  - Public can still view valid invitations by token for signup
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Club admins can view invitations" ON member_invitations;
DROP POLICY IF EXISTS "Club admins can create invitations" ON member_invitations;
DROP POLICY IF EXISTS "Club admins can update invitations" ON member_invitations;

-- Create new policies that check both user_clubs and club ownership

-- View policy: Club admins OR club creators can view
CREATE POLICY "Club admins and creators can view invitations" ON member_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = member_invitations.club_id
      AND c.created_by_user_id = auth.uid()
    )
  );

-- Insert policy: Club admins OR club creators can create
CREATE POLICY "Club admins and creators can create invitations" ON member_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = member_invitations.club_id
      AND c.created_by_user_id = auth.uid()
    )
  );

-- Update policy: Club admins OR club creators can update
CREATE POLICY "Club admins and creators can update invitations" ON member_invitations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = member_invitations.club_id
      AND c.created_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = member_invitations.club_id
      AND uc.user_id = auth.uid()
      AND uc.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM clubs c
      WHERE c.id = member_invitations.club_id
      AND c.created_by_user_id = auth.uid()
    )
  );
