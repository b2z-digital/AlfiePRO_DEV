/*
  # Race Simulator: a club's own water

  One new table, sim_venues: a venue the simulator can race at, built from a club's saved venue
  location and OpenStreetMap, with what the club knows about its water.

    - shape    the water's edge, islands, what's on the bank, the places across the water and where
               the skippers stand (the simulator's VenueDef, as built by src/sim/venueBuild.ts from
               the map round venues.latitude / venues.longitude). Map data (c) OpenStreetMap
               contributors, ODbL: the credit is stored with the shape and shown wherever it's drawn.
    - version  goes up each time the shape changes, so a live race or a challenge can say exactly
               which water it was set on.
    - traits   the club's own words: a line about the place, the winds it gets (direction, name,
               when, steady / shifty / gusty, a note, and whether the breeze is better along the
               skippers' bank or out from it) and short local tips.
    - look     the country round the water for the bank view (hills, trees, houses: 0 to 1 each).

  Who can do what
    - Read:   any signed-in member, once the club has published it (so visitors can sail your
              water); before that, only the club's admins and super admins.
    - Write:  the club's admins and super admins.

  Nothing existing is changed.
*/

CREATE TABLE IF NOT EXISTS public.sim_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  -- The saved venue it was built from (one simulator venue for each).
  venue_id uuid UNIQUE REFERENCES public.venues(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  short_name text NOT NULL CHECK (char_length(short_name) BETWEEN 2 AND 60),
  place text NOT NULL DEFAULT '' CHECK (char_length(place) <= 160),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  shape jsonb NOT NULL CHECK (jsonb_typeof(shape) = 'object' AND pg_column_size(shape) < 600000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  traits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(traits) = 'object' AND pg_column_size(traits) < 20000),
  look jsonb CHECK (look IS NULL OR jsonb_typeof(look) = 'object'),
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sim_venues IS 'Race Simulator: a club''s own water, built from its venue location and OpenStreetMap (ODbL), with the club''s local knowledge.';
CREATE INDEX IF NOT EXISTS sim_venues_club_idx ON public.sim_venues (club_id);
CREATE INDEX IF NOT EXISTS sim_venues_published_idx ON public.sim_venues (is_published) WHERE is_published;

ALTER TABLE public.sim_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_venues: everyone sees published water, admins see their own drafts" ON public.sim_venues FOR SELECT TO authenticated
  USING (is_published OR public.is_club_admin(club_id) OR public.is_super_admin());
CREATE POLICY "sim_venues: club admins add" ON public.sim_venues FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND (public.is_club_admin(club_id) OR public.is_super_admin()));
CREATE POLICY "sim_venues: club admins change" ON public.sim_venues FOR UPDATE TO authenticated
  USING (public.is_club_admin(club_id) OR public.is_super_admin())
  WITH CHECK (public.is_club_admin(club_id) OR public.is_super_admin());
CREATE POLICY "sim_venues: club admins remove" ON public.sim_venues FOR DELETE TO authenticated
  USING (public.is_club_admin(club_id) OR public.is_super_admin());

-- The version goes up whenever the shape changes, and updated_at with any change.
CREATE OR REPLACE FUNCTION public.sim_venues_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.shape IS DISTINCT FROM OLD.shape THEN NEW.version := OLD.version + 1; ELSE NEW.version := OLD.version; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sim_venues_touch ON public.sim_venues;
CREATE TRIGGER sim_venues_touch BEFORE UPDATE ON public.sim_venues FOR EACH ROW EXECUTE FUNCTION public.sim_venues_touch();
