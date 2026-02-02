/*
  # Fix member_boats RLS policies for club admins
  
  1. Changes
    - Update RLS policies to allow club admins to manage all member boats
    - Ensure club admins can view, insert, update, and delete boats for any member in their club
    - Maintain existing policies for regular members to manage their own boats
    
  2. Notes
    - Fixes issue where club admins couldn't manage boats for members
    - Ensures proper access control while allowing membership management
*/

-- Drop existing policies for member_boats
DROP POLICY IF EXISTS "Users can view their own boats" ON member_boats;
DROP POLICY IF EXISTS "Users can update their own boats" ON member_boats;
DROP POLICY IF EXISTS "Users can delete their own boats" ON member_boats;
DROP POLICY IF EXISTS "Users can insert boats for their members" ON member_boats;

-- Create new policies that allow both:
-- 1. Users to manage their own boats
-- 2. Club admins to manage boats for any member in their clubs

-- SELECT policy
CREATE POLICY "Users can view their own boats or club admins can view all boats"
  ON member_boats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = member_boats.member_id
      AND (
        -- User is the member
        m.user_id = auth.uid()
        OR
        -- User is an admin of the club the member belongs to
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.club_id = m.club_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
      )
    )
  );

-- INSERT policy
CREATE POLICY "Users can insert boats for themselves or club admins can insert for any member"
  ON member_boats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = member_boats.member_id
      AND (
        -- User is the member
        m.user_id = auth.uid()
        OR
        -- User is an admin of the club the member belongs to
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.club_id = m.club_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
      )
    )
  );

-- UPDATE policy
CREATE POLICY "Users can update their own boats or club admins can update any boat"
  ON member_boats
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = member_boats.member_id
      AND (
        -- User is the member
        m.user_id = auth.uid()
        OR
        -- User is an admin of the club the member belongs to
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.club_id = m.club_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
      )
    )
  );

-- DELETE policy
CREATE POLICY "Users can delete their own boats or club admins can delete any boat"
  ON member_boats
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = member_boats.member_id
      AND (
        -- User is the member
        m.user_id = auth.uid()
        OR
        -- User is an admin of the club the member belongs to
        EXISTS (
          SELECT 1 FROM user_clubs uc
          WHERE uc.club_id = m.club_id
          AND uc.user_id = auth.uid()
          AND uc.role = 'admin'
        )
      )
    )
  );