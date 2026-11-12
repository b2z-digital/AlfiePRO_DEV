-- The Sailing Academy's world races move to the clubs' real waters across Australia and New Zealand
-- (src/sim/venues, built from OpenStreetMap), in place of the Circuit's invented ones, and the Majors
-- are named for their cities. Events already open keep their water; new ones open on the real waters.
-- The winds each water is known for are as in the app (each venue's traits). Nothing else changes in
-- either function.
CREATE OR REPLACE FUNCTION public.sim_world_race(p_class text, p_venue text, p_level text, p_fleet int, p_coach text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  winds jsonb := '{
    "lmryc": [[75,"oscillating"],[180,"puffy"],[290,"puffy"]],
    "kbryc": [[50,"oscillating"],[180,"puffy"],[280,"puffy"]],
    "plrmyc": [[215,"steady"],[350,"puffy"],[250,"puffy"]],
    "paradise": [[135,"steady"],[45,"oscillating"],[260,"puffy"]],
    "kawana": [[135,"steady"],[60,"oscillating"],[240,"puffy"]],
    "lillydale": [[350,"puffy"],[210,"oscillating"],[290,"puffy"]],
    "jackadder": [[225,"steady"],[90,"puffy"],[315,"puffy"]],
    "risdon": [[315,"puffy"],[140,"steady"],[200,"oscillating"]],
    "gladstone": [[110,"steady"],[30,"oscillating"],[250,"puffy"]],
    "patawalonga": [[225,"steady"],[10,"puffy"],[280,"oscillating"]],
    "taurikura": [[45,"steady"],[225,"puffy"],[290,"oscillating"]]
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
  -- The clubs' real waters, in an order that moves round the states from day to day.
  waters text[] := ARRAY['lmryc', 'paradise', 'plrmyc', 'patawalonga', 'kawana', 'jackadder', 'kbryc',
                         'risdon', 'lillydale', 'taurikura', 'gladstone'];
  water_names jsonb := '{"lmryc":"Lake Macquarie","kbryc":"Kogarah Bay","plrmyc":"Patterson Lakes","lillydale":"Lillydale Lake",
    "paradise":"Emerald Lakes","kawana":"Lake Kawana","gladstone":"Gladstone Marina","patawalonga":"The Patawalonga",
    "jackadder":"Jackadder Lake","risdon":"Risdon Brook","taurikura":"Lake Taurikura"}';
  -- A Major in ISO weeks 10, 23, 36 and 49, each at its own water and named for its city.
  majors jsonb := '{"10":"paradise","23":"jackadder","36":"lmryc","49":"plrmyc"}';
  major_names jsonb := '{"paradise":"Gold Coast","jackadder":"Perth","lmryc":"Lake Macquarie","plrmyc":"Melbourne"}';
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
        VALUES (NULL, 'The ' || (major_names ->> venue) || ' Major', 'Twelve races at ' || (water_names ->> venue) || ', two a day, against the world''s best skippers. Open to every ' || (class_names ->> cls) || ' skipper with a World Regatta result this year. Your first try at each counts; two races are dropped.',
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
