/*
  # Auto-add Club Creator to user_clubs and Fix Search Path

  1. Changes
    - Set explicit search_path for authenticated and anon roles to include public schema
    - Ensure trigger adds creator to user_clubs immediately after club creation
    - This allows the creator to see their club in the RETURNING clause

  2. Security
    - Maintains proper schema resolution for RLS policies
    - Ensures creators become admins of their clubs automatically
*/

-- Set search_path for authenticated and anon roles to ensure they can see public schema
ALTER ROLE authenticated SET search_path TO public, extensions;
ALTER ROLE anon SET search_path TO public, extensions;

-- Create or replace trigger function to auto-add creator to user_clubs
CREATE OR REPLACE FUNCTION public.auto_add_creator_to_user_clubs()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add the creator as an admin to user_clubs
  INSERT INTO public.user_clubs (user_id, club_id, role)
  VALUES (NEW.created_by_user_id, NEW.id, 'admin')
  ON CONFLICT (user_id, club_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_add_creator_to_user_clubs_trigger ON clubs;

-- Create trigger that fires BEFORE INSERT so user_clubs entry exists when policies are evaluated
CREATE TRIGGER auto_add_creator_to_user_clubs_trigger
  AFTER INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_creator_to_user_clubs();
