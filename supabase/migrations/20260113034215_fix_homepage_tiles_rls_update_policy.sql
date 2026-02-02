/*
  # Fix Homepage Tiles RLS Update Policy

  1. Changes
    - Drops and recreates the UPDATE policy for homepage_tiles
    - Adds proper schema qualification to prevent RLS evaluation issues
    - Uses a security definer helper function to check user permissions
    - Ensures WITH CHECK clause can properly evaluate against new row state

  2. Security
    - Maintains strict access control - only club admins/editors can update tiles
    - Fixes 403 Forbidden error when toggling tile visibility
*/

-- Create a helper function to check if user can manage homepage tiles
CREATE OR REPLACE FUNCTION public.user_can_manage_homepage_tiles(p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.club_id = p_club_id
    AND user_clubs.user_id = auth.uid()
    AND user_clubs.role IN ('admin', 'editor')
  );
END;
$$;

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Club admins can update tiles" ON public.homepage_tiles;

-- Recreate UPDATE policy using the helper function
CREATE POLICY "Club admins can update tiles"
  ON public.homepage_tiles FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_homepage_tiles(club_id))
  WITH CHECK (public.user_can_manage_homepage_tiles(club_id));

-- Also fix the slides policy while we're at it
CREATE OR REPLACE FUNCTION public.user_can_manage_homepage_slides(p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_clubs
    WHERE user_clubs.club_id = p_club_id
    AND user_clubs.user_id = auth.uid()
    AND user_clubs.role IN ('admin', 'editor')
  );
END;
$$;

-- Drop and recreate UPDATE policy for slides
DROP POLICY IF EXISTS "Club admins can update slides" ON public.homepage_slides;

CREATE POLICY "Club admins can update slides"
  ON public.homepage_slides FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_homepage_slides(club_id))
  WITH CHECK (public.user_can_manage_homepage_slides(club_id));
