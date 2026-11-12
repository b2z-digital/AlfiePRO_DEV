-- Race Simulator, stage D: the world. Racing profiles (a racing name, a flag, a club, or not at all),
-- the daily race, the weekly World Regatta, four Majors a year, world points and the world tables.
-- Shown to Stephen before applying (12 Nov 2026).
--
-- Built on the virtual events of 10 Nov: each world event is a platform-wide sim_event (club_id NULL)
-- whose races are sim_challenges, and whose entries are sim_challenge_entries, so the race screens,
-- the results sheet, first tries and ghosts all work as they do for a club's virtual event.
--
-- Rules kept:
--  * Nobody appears to anyone outside their club until they choose to. Appearing is a racing profile
--    (sim_skippers), made once, the first time they would appear; until then they can sail the
--    world's races for practice but are on no board or table. Deleting it takes them off again.
--  * The name shown is their racing name, or their own name taken from their AlfiePRO profile (never
--    typed into the app, so nobody can race under someone else's name). Their club is shown only if
--    they choose it, and only a club they belong to.
--  * Nothing here touches a club's real events or results, or a member's club profile.
--  * The schedule does nothing until Stephen switches 'sim_world' on in Feature Access, so applying
--    this changes nothing that members see.

-- ── 1. Racing profiles: how a member appears to the world, if at all ──
CREATE TABLE IF NOT EXISTS public.sim_skippers (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'racing': the racing name; 'own': the member's own name, from their AlfiePRO profile.
  shown text NOT NULL DEFAULT 'racing' CHECK (shown IN ('racing', 'own')),
  racing_name text NOT NULL CHECK (racing_name ~ '^[A-Za-z0-9][A-Za-z0-9 .''-]{1,18}[A-Za-z0-9.]$'),
  -- Filled from the member's profile by the trigger below; whatever the app sends is replaced.
  own_name text,
  label text GENERATED ALWAYS AS (CASE WHEN shown = 'own' AND own_name IS NOT NULL THEN own_name ELSE racing_name END) STORED,
  -- ISO 3166-1 alpha-2 (as AlfiePRO's results use); NULL: no flag.
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  -- NULL: no club shown. club_name is filled by the trigger.
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  club_name text,
  -- From the member's own races in the Academy (the app keeps these up to date). Game numbers only.
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 0 AND 4000),
  level text CHECK (level IS NULL OR level IN ('club', 'state', 'national', 'world')),
  medals smallint NOT NULL DEFAULT 0 CHECK (medals BETWEEN 0 AND 10000),
  titles smallint NOT NULL DEFAULT 0 CHECK (titles BETWEEN 0 AND 10000),
  -- Taken off the tables by a super admin (an unsuitable name, say). Only super admins change it.
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sim_skippers IS 'Race Simulator: how a member appears on the world''s boards and tables, if they choose to. No row: they don''t appear.';
CREATE UNIQUE INDEX IF NOT EXISTS sim_skippers_racing_name_idx ON public.sim_skippers (lower(racing_name));
CREATE INDEX IF NOT EXISTS sim_skippers_country_idx ON public.sim_skippers (country) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS sim_skippers_club_idx ON public.sim_skippers (club_id) WHERE NOT hidden;

CREATE OR REPLACE FUNCTION public.sim_skippers_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.own_name := (
    SELECT left(nullif(btrim(concat_ws(' ', nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), ''))), ''), 60)
    FROM public.profiles p WHERE p.id = NEW.user_id
  );
  NEW.club_name := CASE WHEN NEW.club_id IS NULL THEN NULL ELSE (SELECT left(c.name, 80) FROM public.clubs c WHERE c.id = NEW.club_id) END;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_super_admin() THEN NEW.hidden := false; END IF;
    NEW.created_at := now();
  ELSIF NEW.hidden IS DISTINCT FROM OLD.hidden AND NOT public.is_super_admin() THEN
    NEW.hidden := OLD.hidden;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sim_skippers_fill ON public.sim_skippers;
CREATE TRIGGER sim_skippers_fill BEFORE INSERT OR UPDATE ON public.sim_skippers
  FOR EACH ROW EXECUTE FUNCTION public.sim_skippers_fill();

ALTER TABLE public.sim_skippers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sim_skippers: everyone sees those who appear" ON public.sim_skippers;
CREATE POLICY "sim_skippers: everyone sees those who appear" ON public.sim_skippers FOR SELECT TO authenticated
  USING (NOT hidden OR user_id = (SELECT auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "sim_skippers: appear" ON public.sim_skippers;
CREATE POLICY "sim_skippers: appear" ON public.sim_skippers FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (club_id IS NULL OR public.user_is_club_member(club_id, (SELECT auth.uid()))));
DROP POLICY IF EXISTS "sim_skippers: change how you appear" ON public.sim_skippers;
CREATE POLICY "sim_skippers: change how you appear" ON public.sim_skippers FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_super_admin())
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND (club_id IS NULL OR public.user_is_club_member(club_id, (SELECT auth.uid()))))
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS "sim_skippers: stop appearing" ON public.sim_skippers;
CREATE POLICY "sim_skippers: stop appearing" ON public.sim_skippers FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());

-- A member's own name is shown only if they choose it (as label); the column itself isn't readable.
REVOKE SELECT ON public.sim_skippers FROM anon, authenticated;
GRANT SELECT (user_id, shown, racing_name, label, country, club_id, club_name, rating, level, medals, titles, hidden, created_at, updated_at)
  ON public.sim_skippers TO authenticated;

-- Does this member appear (a racing profile, not taken off)?
CREATE OR REPLACE FUNCTION public.sim_appears(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sim_skippers s WHERE s.user_id = p_user AND NOT s.hidden);
$$;
REVOKE ALL ON FUNCTION public.sim_appears(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_appears(uuid) TO authenticated;

-- ── 2. World events: the daily race, the World Regatta and the Majors, one of each per class ──
ALTER TABLE public.sim_events
  ADD COLUMN IF NOT EXISTS kind text CHECK (kind IS NULL OR kind IN ('daily', 'regatta', 'major')),
  ADD COLUMN IF NOT EXISTS class_id text,
  -- e.g. 'daily:2026-11-13:IOM', 'regatta:2026-W47:DF95', 'major:2026-W49:10R'; made once by the schedule.
  ADD COLUMN IF NOT EXISTS world_key text UNIQUE,
  -- When the event was scored into world points.
  ADD COLUMN IF NOT EXISTS final_at timestamptz;
ALTER TABLE public.sim_events DROP CONSTRAINT IF EXISTS sim_events_world_check;
ALTER TABLE public.sim_events ADD CONSTRAINT sim_events_world_check CHECK (kind IS NULL OR (club_id IS NULL AND class_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS sim_events_world_idx ON public.sim_events (kind, class_id, created_at DESC) WHERE kind IS NOT NULL;

-- What kind of world event (if any) a race belongs to, and its class.
CREATE OR REPLACE FUNCTION public.sim_world_kind(p_challenge uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.kind FROM public.sim_challenges c JOIN public.sim_events e ON e.id = c.event_id WHERE c.id = p_challenge;
$$;
REVOKE ALL ON FUNCTION public.sim_world_kind(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_world_kind(uuid) TO authenticated;

-- ── 3. World results and points: each event's final places, scored when its last race closes ──
CREATE TABLE IF NOT EXISTS public.sim_world_results (
  event_id uuid NOT NULL REFERENCES public.sim_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily', 'regatta', 'major')),
  class_id text NOT NULL,
  place smallint NOT NULL,
  of_n smallint NOT NULL,
  net numeric NOT NULL,
  points integer NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
COMMENT ON TABLE public.sim_world_results IS 'Race Simulator: a skipper''s final place and world points in a world event. Written only by the schedule.';
CREATE INDEX IF NOT EXISTS sim_world_results_user_idx ON public.sim_world_results (user_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS sim_world_results_class_idx ON public.sim_world_results (class_id, closed_at DESC);
ALTER TABLE public.sim_world_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sim_world_results: those who appear, and your own" ON public.sim_world_results;
CREATE POLICY "sim_world_results: those who appear, and your own" ON public.sim_world_results FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.sim_appears(user_id) OR public.is_super_admin());
-- No insert, update or delete policies: only the schedule (below) writes here.

-- A Major is entered with a World Regatta result in its class in the twelve months before.
CREATE OR REPLACE FUNCTION public.sim_major_eligible(p_user uuid, p_challenge uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sim_challenges c
    JOIN public.sim_events e ON e.id = c.event_id
    JOIN public.sim_world_results w ON w.user_id = p_user AND w.kind = 'regatta' AND w.class_id = e.class_id
    WHERE c.id = p_challenge AND w.closed_at > e.created_at - interval '365 days'
  );
$$;
REVOKE ALL ON FUNCTION public.sim_major_eligible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_major_eligible(uuid, uuid) TO authenticated;

-- ── 4. Entries in world races: only by those who appear, under the name they appear by ──
-- The leaderboard of a world race shows only those who appear (and you, to yourself).
DROP POLICY IF EXISTS "sim_challenge_entries: see the leaderboard" ON public.sim_challenge_entries;
CREATE POLICY "sim_challenge_entries: see the leaderboard" ON public.sim_challenge_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sim_challenges c
      WHERE c.id = challenge_id
        AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, (SELECT auth.uid())) OR public.is_super_admin())
    )
    AND (user_id = (SELECT auth.uid()) OR public.sim_world_kind(challenge_id) IS NULL OR public.sim_appears(user_id) OR public.is_super_admin())
  );
-- Enter a world race once you appear (a Major: with a World Regatta result in the class this year).
DROP POLICY IF EXISTS "sim_challenge_entries: enter" ON public.sim_challenge_entries;
CREATE POLICY "sim_challenge_entries: enter" ON public.sim_challenge_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.sim_challenges c
      WHERE c.id = challenge_id AND now() >= c.opens_at AND (c.closes_at IS NULL OR now() < c.closes_at)
        AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, (SELECT auth.uid())))
    )
    AND (CASE WHEN public.sim_first_try(challenge_id) THEN status = 'started' ELSE status <> 'started' END)
    AND (
      public.sim_world_kind(challenge_id) IS NULL
      OR (public.sim_appears((SELECT auth.uid()))
          AND (public.sim_world_kind(challenge_id) <> 'major' OR public.sim_major_eligible((SELECT auth.uid()), challenge_id)))
    )
  );

-- In a world race the name on the board is the one you appear by, whatever the app sends.
CREATE OR REPLACE FUNCTION public.sim_world_entry_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE l text;
BEGIN
  IF public.sim_world_kind(NEW.challenge_id) IS NOT NULL THEN
    SELECT left(s.label, 60) INTO l FROM public.sim_skippers s WHERE s.user_id = NEW.user_id;
    IF l IS NOT NULL THEN NEW.display_name := l; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sim_world_entry_name ON public.sim_challenge_entries;
CREATE TRIGGER sim_world_entry_name BEFORE INSERT OR UPDATE ON public.sim_challenge_entries
  FOR EACH ROW EXECUTE FUNCTION public.sim_world_entry_name();

-- A new racing name (or showing your own name) carries to your entries in world races.
CREATE OR REPLACE FUNCTION public.sim_skippers_rename()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.label IS DISTINCT FROM OLD.label THEN
    UPDATE public.sim_challenge_entries x SET display_name = left(NEW.label, 60)
    FROM public.sim_challenges c JOIN public.sim_events e ON e.id = c.event_id
    WHERE x.challenge_id = c.id AND e.kind IS NOT NULL AND x.user_id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS sim_skippers_rename ON public.sim_skippers;
CREATE TRIGGER sim_skippers_rename AFTER UPDATE ON public.sim_skippers
  FOR EACH ROW EXECUTE FUNCTION public.sim_skippers_rename();

-- ── 5. Scoring a world event into places and world points ──
-- Low point. In each race, finishers are ranked by elapsed time; anyone else who entered the event
-- (didn't finish, or didn't sail it) scores the number of entrants plus one. The event's drops apply.
-- Ties: the lower total of all races, then the better best race.
-- World points: base x ((entrants - place + 1) / entrants) ^ 1.5 x a size factor (full at 50
-- entrants), at least 1. Base: daily race 10, World Regatta 100, Major 400.
CREATE OR REPLACE FUNCTION public.sim_finalise_event(p_event uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev public.sim_events%ROWTYPE;
  n_races int; n int; n_drops int; base numeric;
BEGIN
  SELECT * INTO ev FROM public.sim_events WHERE id = p_event AND kind IS NOT NULL AND final_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO n_races FROM public.sim_challenges WHERE event_id = p_event;
  SELECT count(DISTINCT x.user_id) INTO n
    FROM public.sim_challenge_entries x JOIN public.sim_challenges c ON c.id = x.challenge_id WHERE c.event_id = p_event;
  n_drops := (SELECT count(*) FROM unnest(ev.drops) d WHERE d <= n_races);
  base := CASE ev.kind WHEN 'daily' THEN 10 WHEN 'regatta' THEN 100 ELSE 400 END;
  IF n > 0 AND n_races > 0 THEN
    INSERT INTO public.sim_world_results (event_id, user_id, kind, class_id, place, of_n, net, points, closed_at)
    WITH races AS (SELECT id FROM public.sim_challenges WHERE event_id = p_event),
    ppl AS (SELECT DISTINCT x.user_id FROM public.sim_challenge_entries x JOIN races r ON r.id = x.challenge_id),
    fin AS (
      SELECT x.challenge_id, x.user_id, rank() OVER (PARTITION BY x.challenge_id ORDER BY x.elapsed_s) AS r
      FROM public.sim_challenge_entries x JOIN races ON races.id = x.challenge_id
      WHERE x.status = 'finished' AND x.elapsed_s IS NOT NULL
    ),
    grid AS (
      SELECT p.user_id, coalesce(f.r, n + 1) AS score
      FROM ppl p CROSS JOIN races r LEFT JOIN fin f ON f.challenge_id = r.id AND f.user_id = p.user_id
    ),
    ord AS (SELECT user_id, score, row_number() OVER (PARTITION BY user_id ORDER BY score DESC) AS k FROM grid),
    tot AS (
      SELECT user_id, coalesce(sum(score) FILTER (WHERE k > n_drops), 0) AS net, sum(score) AS gross, min(score) AS best
      FROM ord GROUP BY user_id
    ),
    placed AS (SELECT user_id, net, rank() OVER (ORDER BY net, gross, best) AS place FROM tot)
    SELECT p_event, user_id, ev.kind, ev.class_id, place, n, net,
      greatest(1, round(base * power((n - place + 1)::numeric / n, 1.5) * least(1, ln(n + 1) / ln(51))))::int,
      now()
    FROM placed
    ON CONFLICT (event_id, user_id) DO NOTHING;
  END IF;
  UPDATE public.sim_events SET final_at = now() WHERE id = p_event;
END;
$$;
REVOKE ALL ON FUNCTION public.sim_finalise_event(uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. The world tables: points from the best sixteen results of the last twelve months ──
-- Filter by class, country or club (club: those who show it). Only those who appear are listed;
-- the position is within the table asked for.
CREATE OR REPLACE FUNCTION public.sim_world_table(p_class text DEFAULT NULL, p_country text DEFAULT NULL, p_club uuid DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE (pos bigint, user_id uuid, label text, country text, club_name text, points bigint, events bigint, wins bigint, podiums bigint, rating smallint, level text, medals smallint, titles smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (
    SELECT w.user_id, w.points, w.place, row_number() OVER (PARTITION BY w.user_id ORDER BY w.points DESC) AS k
    FROM public.sim_world_results w
    WHERE w.closed_at > now() - interval '365 days' AND (p_class IS NULL OR w.class_id = p_class)
  ),
  t AS (
    SELECT r.user_id, sum(r.points) FILTER (WHERE r.k <= 16) AS pts, count(*) AS ev,
      count(*) FILTER (WHERE r.place = 1) AS wins, count(*) FILTER (WHERE r.place <= 3) AS pods
    FROM r GROUP BY r.user_id
  )
  SELECT rank() OVER (ORDER BY t.pts DESC), s.user_id, s.label, s.country, s.club_name, t.pts, t.ev, t.wins, t.pods, s.rating, s.level, s.medals, s.titles
  FROM t JOIN public.sim_skippers s ON s.user_id = t.user_id AND NOT s.hidden
  WHERE (p_country IS NULL OR s.country = p_country) AND (p_club IS NULL OR s.club_id = p_club)
  ORDER BY t.pts DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
REVOKE ALL ON FUNCTION public.sim_world_table(text, text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_world_table(text, text, uuid, int) TO authenticated;

-- ── 7. The schedule ──
-- Classes and the Circuit's invented waters (with the winds each is known for, as in the app's
-- src/sim/venues/circuit.ts). Every class has its own daily race, World Regatta and Majors.
CREATE OR REPLACE FUNCTION public.sim_world_race(p_class text, p_venue text, p_level text, p_fleet int, p_coach text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  winds jsonb := '{
    "circuit-lantern-quay":    [[250,"puffy"],[70,"steady"]],
    "circuit-heron-reach":     [[285,"persistent"],[100,"oscillating"]],
    "circuit-kestrelwater":    [[340,"puffy"],[265,"oscillating"]],
    "circuit-aurel-lake":      [[225,"oscillating"],[45,"steady"],[315,"puffy"]],
    "circuit-skerry-sound":    [[320,"steady"],[30,"oscillating"]],
    "circuit-tamarind-lagoon": [[60,"steady"],[300,"oscillating"]],
    "circuit-port-meridian":   [[330,"oscillating"],[40,"steady"],[290,"puffy"]]
  }'::jsonb;
  w jsonb; strength text; sea text; x float := random();
BEGIN
  w := (winds -> p_venue) -> floor(random() * jsonb_array_length(winds -> p_venue))::int;
  strength := CASE WHEN x < 0.25 THEN 'light' WHEN x < 0.75 THEN 'medium' ELSE 'fresh' END;
  sea := CASE strength WHEN 'light' THEN 'flat' WHEN 'medium' THEN (CASE WHEN random() < 0.5 THEN 'flat' ELSE 'chop' END)
                       ELSE (CASE WHEN random() < 0.6 THEN 'chop' ELSE 'rough' END) END;
  RETURN jsonb_build_object(
    'classId', p_class, 'fleetSize', p_fleet, 'level', p_level,
    'windStrength', strength, 'windCharacter', w ->> 1, 'windFrom', (w ->> 0)::int + floor(random() * 21)::int - 10,
    'venue', p_venue, 'seaState', sea,
    'laps', 2, 'length', 'medium', 'sequenceSeconds', 60, 'coach', p_coach, 'autoTrim', false,
    'seed', floor(random() * 1e9)::bigint, 'tune', 2
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sim_world_race(text, text, text, int, text) FROM PUBLIC, anon, authenticated;

-- Run every hour: open the day's daily races, the week's World Regattas and (in a Major's week) the
-- Major's races as each day comes; score events that have closed; and let go of old race logs.
-- Days and weeks are UTC (a day's race opens at 11 am in Sydney, 8 am in Perth, midnight in London).
CREATE OR REPLACE FUNCTION public.sim_world_tick()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  classes text[] := ARRAY['IOM', 'DF95', 'DF65', '10R', 'M'];
  class_names jsonb := '{"IOM":"IOM","DF95":"DF95","DF65":"DF65","10R":"10 Rater","M":"Marblehead"}';
  waters text[] := ARRAY['circuit-lantern-quay', 'circuit-heron-reach', 'circuit-kestrelwater', 'circuit-aurel-lake',
                         'circuit-skerry-sound', 'circuit-tamarind-lagoon', 'circuit-port-meridian'];
  water_names jsonb := '{"circuit-lantern-quay":"Lantern Quay","circuit-heron-reach":"Heron Reach","circuit-kestrelwater":"Kestrelwater",
    "circuit-aurel-lake":"Aurel Lake","circuit-skerry-sound":"Skerry Sound","circuit-tamarind-lagoon":"Tamarind Lagoon","circuit-port-meridian":"Port Meridian"}';
  -- A Major in ISO weeks 10, 23, 36 and 49, each at its own water.
  majors jsonb := '{"10":"circuit-aurel-lake","23":"circuit-skerry-sound","36":"circuit-tamarind-lagoon","49":"circuit-port-meridian"}';
  now_utc timestamp := (now() AT TIME ZONE 'UTC');
  day_start timestamp := date_trunc('day', now_utc);
  week_start timestamp := date_trunc('week', now_utc);
  week_key text := to_char(now_utc, 'IYYY-"W"IW');
  week_no int := extract(week FROM now_utc)::int;
  day_no int := (now_utc::date - date '2026-01-05');
  cls text; k int; ev uuid; venue text; key text; ev_id uuid; n_open int;
BEGIN
  -- Score what has closed (always, even when the world is switched off).
  FOR ev IN
    SELECT e.id FROM public.sim_events e
    WHERE e.kind IS NOT NULL AND e.final_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.sim_challenges c WHERE c.event_id = e.id AND (c.closes_at IS NULL OR c.closes_at > now()))
      AND EXISTS (SELECT 1 FROM public.sim_challenges c WHERE c.event_id = e.id)
  LOOP
    PERFORM public.sim_finalise_event(ev);
  END LOOP;

  -- Race logs in world races are kept for thirty days after the race closes (for ghosts and replays).
  UPDATE public.sim_challenge_entries x SET log = NULL
  FROM public.sim_challenges c JOIN public.sim_events e ON e.id = c.event_id
  WHERE x.challenge_id = c.id AND e.kind IS NOT NULL AND x.log IS NOT NULL AND c.closes_at < now() - interval '30 days';

  IF NOT coalesce((SELECT f.is_globally_enabled FROM public.platform_feature_controls f WHERE f.feature_key = 'sim_world'), false) THEN
    RETURN;
  END IF;

  FOREACH cls IN ARRAY classes LOOP
    -- The daily race: one race, open for the UTC day, first try counts.
    venue := waters[1 + ((day_no + array_position(classes, cls)) % array_length(waters, 1))];
    key := 'daily:' || to_char(day_start, 'YYYY-MM-DD') || ':' || cls;
    IF NOT EXISTS (SELECT 1 FROM public.sim_events WHERE world_key = key) THEN
      INSERT INTO public.sim_events (club_id, title, description, tries, drops, kind, class_id, world_key, created_by)
      VALUES (NULL, 'Daily race: ' || (water_names ->> venue), 'The same race for every ' || (class_names ->> cls) || ' skipper in the world today. Your first try counts.',
              'first', '{}', 'daily', cls, key, NULL)
      RETURNING id INTO ev_id;
      INSERT INTO public.sim_challenges (club_id, title, settings, opens_at, closes_at, created_by, event_id, race_no)
      VALUES (NULL, 'Race 1', public.sim_world_race(cls, venue, 'national', 10, 'hints'),
              day_start AT TIME ZONE 'UTC', (day_start + interval '1 day') AT TIME ZONE 'UTC', NULL, ev_id, 1);
    END IF;

    -- The World Regatta: six races at one water, open all week (Monday to Monday, UTC), one drop.
    IF NOT (majors ? week_no::text) THEN
      venue := waters[1 + ((week_no + array_position(classes, cls)) % array_length(waters, 1))];
      key := 'regatta:' || week_key || ':' || cls;
      IF NOT EXISTS (SELECT 1 FROM public.sim_events WHERE world_key = key) THEN
        INSERT INTO public.sim_events (club_id, title, description, tries, drops, kind, class_id, world_key, created_by)
        VALUES (NULL, 'World Regatta: ' || (water_names ->> venue), 'Six races at ' || (water_names ->> venue) || ' for every ' || (class_names ->> cls) || ' skipper in the world, open all week. Your first try at each counts; one race is dropped.',
                'first', '{4}', 'regatta', cls, key, NULL)
        RETURNING id INTO ev_id;
        FOR k IN 1..6 LOOP
          INSERT INTO public.sim_challenges (club_id, title, settings, opens_at, closes_at, created_by, event_id, race_no)
          VALUES (NULL, 'Race ' || k, public.sim_world_race(cls, venue, 'national', 12, 'hints'),
                  week_start AT TIME ZONE 'UTC', (week_start + interval '7 days') AT TIME ZONE 'UTC', NULL, ev_id, k);
        END LOOP;
      END IF;
    ELSE
      -- A Major: twelve races, two opening each day Monday to Saturday, all closing the next Monday;
      -- the world's level of skipper, no coaching, two drops. Entry: a World Regatta result this year.
      venue := majors ->> week_no::text;
      key := 'major:' || week_key || ':' || cls;
      SELECT id INTO ev_id FROM public.sim_events WHERE world_key = key;
      IF ev_id IS NULL THEN
        INSERT INTO public.sim_events (club_id, title, description, tries, drops, kind, class_id, world_key, created_by)
        VALUES (NULL, 'The ' || (water_names ->> venue) || ' Major', 'Twelve races at ' || (water_names ->> venue) || ', two a day, against the world''s best skippers. Open to every ' || (class_names ->> cls) || ' skipper with a World Regatta result this year. Your first try at each counts; two races are dropped.',
                'first', '{4,8}', 'major', cls, key, NULL)
        RETURNING id INTO ev_id;
      END IF;
      -- Each race is made only when it opens, so nobody sees it early.
      n_open := least(12, 2 * (1 + least(5, (now_utc::date - week_start::date))));
      FOR k IN 1..n_open LOOP
        IF NOT EXISTS (SELECT 1 FROM public.sim_challenges WHERE event_id = ev_id AND race_no = k) THEN
          INSERT INTO public.sim_challenges (club_id, title, settings, opens_at, closes_at, created_by, event_id, race_no)
          VALUES (NULL, 'Race ' || k, public.sim_world_race(cls, venue, 'world', 12, 'off'),
                  (week_start + ((k - 1) / 2) * interval '1 day') AT TIME ZONE 'UTC', (week_start + interval '7 days') AT TIME ZONE 'UTC', NULL, ev_id, k);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.sim_world_tick() FROM PUBLIC, anon, authenticated;

-- A Major's later races don't exist yet when it opens, so it isn't scored until its week is over.
-- (sim_world_tick scores an event once every race it has has closed; the last of a Major's races
-- closes with the rest, the Monday after.)

SELECT cron.schedule('sim-world-tick', '7 * * * *', $cron$SELECT public.sim_world_tick();$cron$);

-- ── 8. Feature Access: off until Stephen switches it on, after the app that shows it is live ──
INSERT INTO public.platform_feature_controls (feature_key, feature_label, feature_description, feature_group, is_globally_enabled)
VALUES ('sim_world', 'Sailing Academy: the world', 'The daily race, the weekly World Regatta, the Majors, racing names and the world tables in the Sailing Academy.', 'racing', false)
ON CONFLICT (feature_key) DO NOTHING;
