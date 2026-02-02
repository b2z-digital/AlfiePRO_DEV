/*
  # Fix Clubs Duplicate Triggers

  1. Changes
    - Drop the two bad trigger functions and triggers
    - Keep only auto_add_creator_to_user_clubs (which has proper config)
    - Restore the full SELECT policy now that triggers are fixed

  2. Security
    - Maintains proper RLS
    - Fixes trigger function search_path issues
*/

-- Drop duplicate triggers
DROP TRIGGER IF EXISTS add_club_creator_as_admin_trigger ON clubs;
DROP TRIGGER IF EXISTS add_creator_to_user_clubs ON clubs;

-- Drop duplicate functions
DROP FUNCTION IF EXISTS add_club_creator_as_admin();
DROP FUNCTION IF EXISTS add_club_creator_to_user_clubs();

-- Now restore the full SELECT policy with user_clubs checks
DROP POLICY IF EXISTS "Authenticated users can view clubs" ON clubs;

CREATE POLICY "Authenticated users can view clubs"
  ON clubs
  FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.user_is_club_member(id, auth.uid())
    OR public.user_is_super_admin(auth.uid())
  );
