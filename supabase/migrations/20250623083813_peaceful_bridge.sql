/*
  # Fix member-user linking for account owner
  
  1. Changes
    - Links the member record for Stephen Walsh to the correct user account
    - Updates RLS policies to ensure club admins can manage their own member records
    
  2. Notes
    - Ensures the club admin/owner can access their own member data
    - Maintains security while fixing the permission issue
*/

-- First, find the member record for Stephen Walsh and link it to the user account
DO $$
DECLARE
  target_user_id uuid := '0db1234b-0e7d-40c9-815e-067a844dcb7c'; -- Stephen Walsh's user ID
  target_member_id uuid;
BEGIN
  -- Find the member record with email stephen@b2z.com.au
  SELECT id INTO target_member_id
  FROM members
  WHERE email = 'stephen@b2z.com.au'
  LIMIT 1;
  
  -- If found, update the user_id
  IF target_member_id IS NOT NULL THEN
    UPDATE members
    SET user_id = target_user_id
    WHERE id = target_member_id;
    
    RAISE NOTICE 'Updated member record % to link with user %', target_member_id, target_user_id;
  ELSE
    RAISE NOTICE 'No member record found for stephen@b2z.com.au';
  END IF;
END $$;

-- Improve the RLS policies for members table to ensure club admins can manage all members
DROP POLICY IF EXISTS "Club members can manage members" ON members;

-- Create a better policy that allows club admins to manage all members
CREATE POLICY "Club admins can manage members"
ON members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = members.club_id
    AND uc.user_id = auth.uid()
    AND uc.role = 'admin'
  )
);

-- Ensure members can view and update their own profile
DROP POLICY IF EXISTS "Members can view and update their own profile" ON members;
CREATE POLICY "Members can view and update their own profile"
ON members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can update their own profile" ON members;
CREATE POLICY "Members can update their own profile"
ON members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());