/*
  # Auto-add Club Creator to user_clubs Table

  1. Changes
    - Create trigger to automatically add club creator to user_clubs with admin role
    - This ensures creators are immediately members of their clubs

  2. Security
    - Trigger runs with SECURITY DEFINER to bypass RLS
    - Only adds the creator who is already verified by INSERT policy
*/

-- Function to add club creator to user_clubs
CREATE OR REPLACE FUNCTION public.add_club_creator_to_user_clubs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Insert the creator as an admin of the club
  INSERT INTO public.user_clubs (user_id, club_id, role)
  VALUES (NEW.created_by_user_id, NEW.id, 'admin')
  ON CONFLICT (user_id, club_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS add_creator_to_user_clubs ON clubs;

-- Create trigger
CREATE TRIGGER add_creator_to_user_clubs
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.add_club_creator_to_user_clubs();
