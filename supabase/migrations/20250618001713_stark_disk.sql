/*
  # Fix user_clubs INSERT policy for club creation

  1. Security Changes
    - Add INSERT policy to allow users to insert their own club associations
    - This enables the club creation trigger to work properly when adding the creator as admin

  The existing policy "Club admins can insert memberships" prevents club creators from being
  automatically added as admins because they're not yet admins of the club being created.
  This new policy allows users to insert records where they are the user_id.
*/

-- Add policy to allow users to insert their own club associations
CREATE POLICY "Users can insert their own club associations"
  ON user_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);