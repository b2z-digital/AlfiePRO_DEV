/*
  # Fix PostgREST schema cache for club_boat_classes

  1. Changes
    - Forces PostgREST schema cache reload to recognize club_boat_classes table
    - Ensures proper grants on club_boat_classes for all API roles
  
  2. Notes
    - This resolves 404 errors when querying club_boat_classes via the REST API
*/

GRANT ALL ON public.club_boat_classes TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';