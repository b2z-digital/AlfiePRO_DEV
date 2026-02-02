/*
  # Fix member_boats RLS policies for membership form submission

  1. Security Updates
    - Update INSERT policy to allow users to insert boats for members they are creating
    - Ensure proper access control while allowing membership form submission
    - Maintain existing security for other operations

  2. Changes
    - Modify INSERT policy to allow insertion when user is creating their own member record
    - Keep existing policies for SELECT, UPDATE, DELETE unchanged
*/

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can insert their own boats" ON member_boats;

-- Create a new INSERT policy that allows:
-- 1. Users to insert boats for members where they are the user_id
-- 2. Users to insert boats during membership creation (when member exists but might not have user_id set yet)
CREATE POLICY "Users can insert boats for their members"
  ON member_boats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM members m
      WHERE m.id = member_boats.member_id
      AND (
        m.user_id = auth.uid()
        OR (
          m.user_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM user_clubs uc
            WHERE uc.club_id = m.club_id
            AND uc.user_id = auth.uid()
          )
        )
      )
    )
  );