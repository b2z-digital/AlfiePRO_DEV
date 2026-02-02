/*
  # Fix Homepage Tiles Trigger Function

  1. Changes
    - Fix search_path for trigger_create_default_homepage_tiles
    - Use proper named parameter when calling create_default_homepage_tiles

  2. Security
    - Maintains SECURITY DEFINER
    - Sets proper search_path to public schema
*/

CREATE OR REPLACE FUNCTION public.trigger_create_default_homepage_tiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Create default tiles for the new club
  PERFORM public.create_default_homepage_tiles(p_club_id := NEW.id);
  RETURN NEW;
END;
$$;
