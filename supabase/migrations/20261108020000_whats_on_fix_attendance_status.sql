/*
  # What's On fix: attendance answers use the attendance_status type

  On the live database event_attendance.status is the attendance_status type, not text.
  - whats_on_member_ctx: reads it as text (the preview, member count and test send failed
    with "UNION types attendance_status and text cannot be matched").
  - whats_on_answer and the activation trigger: write it through jsonb_populate_record, which
    converts the answer to the column's own type, so it works whether the column is text or
    attendance_status.
  - whats_on_events: only turns races near the date window into JSON (results can be large),
    and a round saved in race_series_rounds always wins over the series' JSON copy.

  Replaces those four functions only. Existing permissions are kept.
*/

CREATE OR REPLACE FUNCTION public.whats_on_events(p_club uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pro jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_meet jsonb := '[]'::jsonb;
  v_uuid text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO v_pro
    FROM public.get_public_pro_assignments(p_club) p;
  EXCEPTION WHEN OTHERS THEN
    v_pro := '[]'::jsonb;
  END;

  WITH q AS (
    SELECT to_jsonb(qr) AS j FROM quick_races qr
    WHERE qr.club_id::text = p_club::text
      AND qr.race_date::text >= (p_from - 60)::text
      AND qr.race_date::text < (p_to + 1)::text
  ), ev AS (
    SELECT 'e:' || (j ->> 'id') AS event_key,
           'event'::text AS kind,
           j ->> 'id' AS event_id,
           NULL::text AS series_id,
           NULL::text AS round_name,
           coalesce(nullif(trim(j ->> 'event_name'), ''), 'Club race') AS title,
           NULL::text AS series_name,
           left(j ->> 'race_date', 10)::date AS event_date,
           CASE WHEN coalesce(j ->> 'multi_day', 'false') = 'true' AND coalesce(j ->> 'end_date', '') ~ '^\d{4}-\d{2}-\d{2}'
                THEN left(j ->> 'end_date', 10)::date END AS end_date,
           nullif(trim(j ->> 'race_venue'), '') AS venue,
           nullif(trim(j ->> 'race_class'), '') AS race_class,
           nullif(trim(j ->> 'race_format'), '') AS race_format,
           coalesce(j ->> 'is_paid', 'false') = 'true' AS is_paid,
           CASE WHEN coalesce(j ->> 'entry_fee', '') ~ '^\d+(\.\d+)?$' THEN (j ->> 'entry_fee')::numeric END AS entry_fee,
           nullif(trim(j ->> 'notice_of_race_url'), '') AS nor_url,
           nullif(trim(j ->> 'sailing_instructions_url'), '') AS si_url,
           nullif(trim(j ->> 'pro_member_name'), '') AS pro_fallback,
           coalesce(nullif(j ->> 'start_time', ''), nullif(j ->> 'first_start_time', '')) AS start_time,
           coalesce(j ->> 'completed', 'false') = 'true' AS completed,
           coalesce(j ->> 'cancelled', 'false') = 'true' AS cancelled
    FROM q
    WHERE coalesce(j ->> 'race_date', '') ~ '^\d{4}-\d{2}-\d{2}'
      AND coalesce(j ->> 'is_simulated', 'false') <> 'true'
      AND coalesce(j ->> 'archived', 'false') <> 'true'
  ), s AS (
    SELECT to_jsonb(rs) AS j FROM race_series rs WHERE rs.club_id::text = p_club::text
  ), tr AS (
    SELECT to_jsonb(rr) AS j FROM race_series_rounds rr
    WHERE rr.series_id::text IN (SELECT s.j ->> 'id' FROM s)
      AND rr.date::text >= (p_from - 7)::text
      AND rr.date::text < (p_to + 1)::text
  ), rounds AS (
    SELECT tr.j ->> 'series_id' AS sid,
           tr.j ->> 'round_name' AS rname,
           tr.j ->> 'date' AS d,
           tr.j ->> 'venue' AS venue,
           tr.j ->> 'race_class' AS rclass,
           tr.j ->> 'race_format' AS rformat,
           coalesce(tr.j ->> 'completed', 'false') = 'true' AS completed,
           coalesce(tr.j ->> 'cancelled', 'false') = 'true' AS cancelled,
           nullif(tr.j ->> 'start_time', '') AS start_time
    FROM tr
    UNION ALL
    SELECT s.j ->> 'id',
           coalesce(nullif(e.r ->> 'name', ''), e.r ->> 'roundName'),
           e.r ->> 'date',
           e.r ->> 'venue',
           NULL, NULL,
           lower(coalesce(e.r ->> 'completed', 'false')) IN ('true', 't', '1'),
           lower(coalesce(e.r ->> 'cancelled', 'false')) IN ('true', 't', '1'),
           nullif(coalesce(e.r ->> 'startTime', e.r ->> 'start_time'), '')
    FROM s
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.j -> 'rounds') = 'array' THEN s.j -> 'rounds' ELSE '[]'::jsonb END) AS e(r)
    WHERE jsonb_typeof(e.r) = 'object'
      -- A round saved in race_series_rounds always wins over the series' JSON copy, whatever its date
      AND NOT EXISTS (SELECT 1 FROM race_series_rounds rr2
                      WHERE rr2.series_id::text = s.j ->> 'id'
                        AND rr2.round_name = coalesce(nullif(e.r ->> 'name', ''), e.r ->> 'roundName'))
  ), rv AS (
    SELECT 'r:' || r.sid || ':' || r.rname,
           'round'::text,
           NULL::text,
           r.sid,
           r.rname,
           r.rname || ' · ' || coalesce(nullif(trim(s.j ->> 'series_name'), ''), 'Series'),
           nullif(trim(s.j ->> 'series_name'), ''),
           left(r.d, 10)::date,
           NULL::date,
           nullif(trim(r.venue), ''),
           coalesce(nullif(trim(r.rclass), ''), nullif(trim(s.j ->> 'race_class'), '')),
           coalesce(nullif(trim(r.rformat), ''), nullif(trim(s.j ->> 'race_format'), '')),
           coalesce(s.j ->> 'is_paid', 'false') = 'true',
           CASE WHEN coalesce(s.j ->> 'entry_fee', '') ~ '^\d+(\.\d+)?$' THEN (s.j ->> 'entry_fee')::numeric END,
           nullif(trim(s.j ->> 'notice_of_race_url'), ''),
           nullif(trim(s.j ->> 'sailing_instructions_url'), ''),
           NULL::text,
           r.start_time,
           r.completed,
           r.cancelled
    FROM rounds r
    JOIN s ON s.j ->> 'id' = r.sid
    WHERE coalesce(r.rname, '') <> '' AND coalesce(r.d, '') ~ '^\d{4}-\d{2}-\d{2}'
  ), allev AS (
    SELECT * FROM ev
    UNION ALL
    SELECT * FROM rv
  ), win AS (
    SELECT a.*,
           CASE WHEN a.event_id ~ v_uuid THEN a.event_id::uuid END AS ev_uuid,
           CASE WHEN a.series_id ~ v_uuid THEN a.series_id::uuid END AS se_uuid
    FROM allev a
    WHERE a.event_date <= p_to
      AND coalesce(a.end_date, a.event_date) >= p_from
      AND NOT a.completed
      AND NOT a.cancelled
  ), full_ev AS (
    SELECT w.*,
           coalesce(
             (SELECT p ->> 'member_name' FROM jsonb_array_elements(v_pro) p
              WHERE w.kind = 'event' AND p ->> 'event_id' = w.event_id AND coalesce(p ->> 'member_name', '') <> '' LIMIT 1),
             (SELECT p ->> 'member_name' FROM jsonb_array_elements(v_pro) p
              WHERE w.kind = 'round' AND p ->> 'series_id' = w.series_id AND p ->> 'duty_date' = w.event_date::text
                AND coalesce(p ->> 'member_name', '') <> '' LIMIT 1),
             w.pro_fallback) AS pro_name,
           (SELECT to_jsonb(v) FROM venues v
            WHERE w.venue IS NOT NULL AND lower(trim(v.name)) = lower(w.venue)
            ORDER BY (to_jsonb(v) ->> 'club_id' = p_club::text) DESC NULLS LAST
            LIMIT 1) AS vj,
           (SELECT count(*) FROM event_attendance ea
            WHERE ea.status = 'yes'
              AND ((w.kind = 'event' AND ea.event_id = w.ev_uuid)
                OR (w.kind = 'round' AND ea.series_id = w.se_uuid AND ea.round_name = w.round_name)))
           + (SELECT count(*) FROM whats_on_answers wa
              WHERE wa.status = 'yes'
                AND ((w.kind = 'event' AND wa.event_id = w.ev_uuid)
                  OR (w.kind = 'round' AND wa.series_id = w.se_uuid AND wa.round_name = w.round_name))) AS going,
           (SELECT count(*) FROM event_attendance ea
            WHERE ea.status = 'no'
              AND ((w.kind = 'event' AND ea.event_id = w.ev_uuid)
                OR (w.kind = 'round' AND ea.series_id = w.se_uuid AND ea.round_name = w.round_name)))
           + (SELECT count(*) FROM whats_on_answers wa
              WHERE wa.status = 'no'
                AND ((w.kind = 'event' AND wa.event_id = w.ev_uuid)
                  OR (w.kind = 'round' AND wa.series_id = w.se_uuid AND wa.round_name = w.round_name))) AS cant
    FROM win w
  )
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'event_key', f.event_key,
           'kind', f.kind,
           'event_id', f.event_id,
           'series_id', f.series_id,
           'round_name', f.round_name,
           'title', f.title,
           'series_name', f.series_name,
           'event_date', f.event_date,
           'end_date', f.end_date,
           'venue', f.venue,
           'venue_address', nullif(trim(f.vj ->> 'address'), ''),
           'map_url', CASE
             WHEN coalesce(f.vj ->> 'latitude', '') ~ '^-?\d+(\.\d+)?$' AND coalesce(f.vj ->> 'longitude', '') ~ '^-?\d+(\.\d+)?$'
                  AND (f.vj ->> 'latitude')::numeric <> 0
               THEN 'https://www.google.com/maps/search/?api=1&query=' || (f.vj ->> 'latitude') || '%2C' || (f.vj ->> 'longitude')
             WHEN f.venue IS NOT NULL
               THEN 'https://www.google.com/maps/search/?api=1&query='
                    || public.whats_on_urlencode(f.venue || coalesce(', ' || nullif(trim(f.vj ->> 'address'), ''), '')) END,
           'race_class', f.race_class,
           'class_key', public.whats_on_class_key(f.race_class),
           'race_format', f.race_format,
           'is_paid', f.is_paid AND coalesce(f.entry_fee, 0) > 0,
           'entry_fee', CASE WHEN f.is_paid AND coalesce(f.entry_fee, 0) > 0 THEN f.entry_fee END,
           'nor_url', CASE WHEN f.nor_url ~ '^https?://' THEN f.nor_url END,
           'si_url', CASE WHEN f.si_url ~ '^https?://' THEN f.si_url END,
           'pro_name', f.pro_name,
           'start_time', public.whats_on_fmt_time(f.start_time),
           'going', f.going,
           'cant', f.cant))
         ORDER BY f.event_date, f.title), '[]'::jsonb)
  INTO v_events
  FROM full_ev f;

  -- General meetings (committee meetings stay private)
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'event_key', 'm:' || (m.j ->> 'id'),
             'kind', 'meeting',
             'title', coalesce(nullif(trim(m.j ->> 'name'), ''), 'Club meeting'),
             'event_date', left(m.j ->> 'date', 10)::date,
             'venue', coalesce(nullif(trim(m.j ->> 'location'), ''),
                               CASE WHEN coalesce(m.j ->> 'conferencing_url', '') <> '' THEN 'Online' END),
             'start_time', public.whats_on_fmt_time(m.j ->> 'start_time')))
           ORDER BY left(m.j ->> 'date', 10)), '[]'::jsonb)
    INTO v_meet
    FROM (SELECT to_jsonb(mt) AS j FROM meetings mt WHERE mt.club_id::text = p_club::text) m
    WHERE coalesce(m.j ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}'
      AND left(m.j ->> 'date', 10)::date BETWEEN p_from AND p_to
      AND coalesce(m.j ->> 'status', 'upcoming') <> 'cancelled'
      AND coalesce(m.j ->> 'meeting_category', 'general') = 'general';
  EXCEPTION WHEN OTHERS THEN
    v_meet := '[]'::jsonb;
  END;

  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'start_time' NULLS FIRST, x ->> 'title'), '[]'::jsonb)
          FROM jsonb_array_elements(v_events || v_meet) x);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_member_ctx(p_member uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb;
  v_user uuid;
  v_boats jsonb;
  v_answers jsonb;
  v_prefs record;
BEGIN
  SELECT to_jsonb(mm) INTO m FROM members mm WHERE mm.id = p_member;
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  v_user := CASE WHEN m ->> 'user_id' IS NOT NULL THEN (m ->> 'user_id')::uuid END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'class', b.boat_type,
           'key', public.whats_on_class_key(b.boat_type),
           'label', nullif(trim(coalesce(nullif(trim(to_jsonb(b) ->> 'hull'), ''), '')
                     || CASE WHEN coalesce(trim(to_jsonb(b) ->> 'sail_number'), '') <> ''
                             THEN ' #' || trim(to_jsonb(b) ->> 'sail_number') ELSE '' END), ''))
         ORDER BY b.boat_type), '[]'::jsonb)
  INTO v_boats
  FROM member_boats b
  WHERE b.member_id = p_member AND coalesce(b.boat_type, '') <> '';

  SELECT coalesce(jsonb_object_agg(k, st), '{}'::jsonb) INTO v_answers
  FROM (
    SELECT DISTINCT ON (k) k, st
    FROM (
      SELECT CASE WHEN ea.event_id IS NOT NULL THEN 'e:' || ea.event_id::text
                  ELSE 'r:' || ea.series_id::text || ':' || coalesce(ea.round_name, '') END AS k,
             ea.status::text AS st, 1 AS pri
      FROM event_attendance ea
      WHERE v_user IS NOT NULL AND ea.user_id = v_user
      UNION ALL
      SELECT CASE WHEN wa.event_id IS NOT NULL THEN 'e:' || wa.event_id::text
                  ELSE 'r:' || wa.series_id::text || ':' || coalesce(wa.round_name, '') END,
             wa.status, 2
      FROM whats_on_answers wa
      WHERE wa.member_id = p_member
    ) z
    ORDER BY k, pri
  ) y;

  SELECT * INTO v_prefs FROM whats_on_member_prefs WHERE member_id = p_member;

  RETURN jsonb_build_object(
    'member_id', p_member,
    'club_id', m ->> 'club_id',
    'first_name', coalesce(nullif(trim(m ->> 'first_name'), ''), 'there'),
    'last_name', coalesce(trim(m ->> 'last_name'), ''),
    'email', m ->> 'email',
    'user_id', v_user,
    'activated', v_user IS NOT NULL AND coalesce(m ->> 'activation_status', '') <> 'pending',
    'pending', v_user IS NOT NULL AND coalesce(m ->> 'activation_status', '') = 'pending',
    'scope', coalesce(v_prefs.scope, 'classes'),
    'enabled', coalesce(v_prefs.whats_on_enabled, true),
    'boats', v_boats,
    'answers', v_answers);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_answer(p_token text, p_event_key text, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  v_page jsonb;
  v_event jsonb;
  v_user uuid;
  v_ev uuid;
  v_se uuid;
  v_round text;
  v_existing uuid;
BEGIN
  IF p_status NOT IN ('yes', 'no', 'maybe') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_answer');
  END IF;
  SELECT * INTO t FROM whats_on_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;

  v_page := public.whats_on_page(p_token, p_event_key);
  v_event := v_page -> 'event';
  IF v_event IS NULL OR jsonb_typeof(v_event) <> 'object' THEN
    RETURN v_page || jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;
  IF v_event ->> 'kind' = 'meeting' THEN
    RETURN v_page || jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  -- Paid events: Going means entering and paying, exactly like the event modal
  IF p_status = 'yes' AND coalesce((v_event ->> 'is_paid')::boolean, false) THEN
    RETURN v_page || jsonb_build_object('needs_entry', true, 'saved', false);
  END IF;

  SELECT m.user_id INTO v_user FROM members m WHERE m.id = t.member_id;
  IF v_event ->> 'kind' = 'event' THEN
    v_ev := (v_event ->> 'event_id')::uuid;
  ELSE
    v_se := (v_event ->> 'series_id')::uuid;
    v_round := v_event ->> 'round_name';
  END IF;

  IF v_user IS NOT NULL THEN
    -- Same row the event modal writes
    SELECT ea.id INTO v_existing FROM event_attendance ea
    WHERE ea.user_id = v_user
      AND ((v_ev IS NOT NULL AND ea.event_id = v_ev)
        OR (v_ev IS NULL AND ea.series_id = v_se AND ea.round_name = v_round))
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      -- jsonb_populate_record converts the answer to the column's own type (attendance_status)
      UPDATE event_attendance ea SET status = r.status, updated_at = now()
      FROM jsonb_populate_record(NULL::public.event_attendance, jsonb_build_object('status', p_status)) r
      WHERE ea.id = v_existing;
    ELSE
      INSERT INTO event_attendance (user_id, club_id, status, event_id, series_id, round_name)
      SELECT r.user_id, r.club_id, r.status, r.event_id, r.series_id, r.round_name
      FROM jsonb_populate_record(NULL::public.event_attendance, jsonb_build_object(
        'user_id', v_user, 'club_id', t.club_id, 'status', p_status,
        'event_id', v_ev, 'series_id', v_se, 'round_name', v_round)) r;
    END IF;
  ELSE
    INSERT INTO whats_on_answers (member_id, club_id, event_id, series_id, round_name, status)
    VALUES (t.member_id, t.club_id, v_ev, v_se, v_round, p_status)
    ON CONFLICT (member_id, coalesce(event_id::text, ''), coalesce(series_id::text, ''), coalesce(round_name, ''))
    DO UPDATE SET status = EXCLUDED.status, updated_at = now();
  END IF;

  INSERT INTO whats_on_answer_log (club_id, member_id, event_key, status)
  VALUES (t.club_id, t.member_id, p_event_key, p_status);

  RETURN public.whats_on_page(p_token, p_event_key) || jsonb_build_object('saved', true, 'saved_status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_move_answers_on_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
BEGIN
  IF NEW.user_id IS NULL OR OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;
  BEGIN
    FOR a IN SELECT * FROM whats_on_answers WHERE member_id = NEW.id LOOP
      IF NOT EXISTS (
        SELECT 1 FROM event_attendance ea
        WHERE ea.user_id = NEW.user_id
          AND ((a.event_id IS NOT NULL AND ea.event_id = a.event_id)
            OR (a.event_id IS NULL AND ea.series_id = a.series_id AND ea.round_name IS NOT DISTINCT FROM a.round_name))) THEN
        INSERT INTO event_attendance (user_id, club_id, status, event_id, series_id, round_name)
        SELECT r.user_id, r.club_id, r.status, r.event_id, r.series_id, r.round_name
        FROM jsonb_populate_record(NULL::public.event_attendance, jsonb_build_object(
          'user_id', NEW.user_id, 'club_id', a.club_id, 'status', a.status,
          'event_id', a.event_id, 'series_id', a.series_id, 'round_name', a.round_name)) r;
      END IF;
    END LOOP;
    DELETE FROM whats_on_answers WHERE member_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whats_on_move_answers_on_link: member %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Make the changes visible to the API straight away
NOTIFY pgrst, 'reload schema';
