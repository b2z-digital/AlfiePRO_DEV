/*
  # What's On: weekly club email with Going / Can't make it / Maybe answers

  Each club can turn on a weekly (or fortnightly / monthly) "What's On" email. Every member gets the
  racing for the classes in their boat shed, with one-tap answers that write the same Yes / No / Maybe
  as "Will you attend?" in the event modal. Off for every club until the club turns it on.

  1. New tables
     - whats_on_settings: one row per club. enabled defaults to false. Schedule (frequency, send day,
       time, club time zone, 7 or 14 days covered, skip quiet weeks), audience, content toggles, help
       contact, wording, colour.
     - whats_on_tokens: one random token per member. The answer links carry it, so no login is needed.
     - whats_on_member_prefs: per-member opt-out and "my classes / all racing".
     - whats_on_answers: answers from members who are not on AlfiePRO yet (event_attendance needs a
       login). They move into event_attendance automatically when the member activates.
     - whats_on_sends, whats_on_send_recipients, whats_on_answer_log: send history and stats.

  2. Functions
     - whats_on_events(club, from, to): club races and series rounds (table rounds, with the series'
       rounds JSON as fallback) plus general meetings, with PRO, venue map link and going counts.
     - whats_on_render(...): builds the club-branded HTML email for one member.
     - whats_on_send(club, kind, ...): renders per member and sends through the send-notification edge
       function (raw HTML, service role from the vault, same pattern as the PRO reminders).
     - whats_on_run_due(): hourly. Sends for clubs whose send day / time has come in their time zone.
     - Admin RPCs (club admins only): whats_on_settings_get / _save, whats_on_preview,
       whats_on_audience, whats_on_send_test, whats_on_send_now.
     - Public RPCs (token only): whats_on_page, whats_on_answer, whats_on_set_prefs.

  3. Answers
     - Going = 'yes', Maybe = 'maybe', Can't make it = 'no', exactly like the event modal.
     - Members on AlfiePRO: written to event_attendance (event_id for club races, series_id + round_name
       for series rounds), the same rows the modal reads and writes.
     - Paid events: Going does not record anything; the page sends the member to enter and pay, as the
       modal does.

  4. Safety
     - Nothing sends unless a club has turned it on. No existing table or policy is changed.
     - The members trigger that moves answers on activation can never block an activation: errors are
       caught and logged as warnings.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Small helpers
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_esc(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

CREATE OR REPLACE FUNCTION public.whats_on_urlencode(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg(
           CASE WHEN ch ~ '^[A-Za-z0-9_.~-]$' THEN ch
                ELSE regexp_replace(upper(encode(convert_to(ch, 'UTF8'), 'hex')), '(..)', '%\1', 'g') END,
           '' ORDER BY i), '')
  FROM regexp_split_to_table(coalesce(p, ''), '') WITH ORDINALITY AS x(ch, i)
$$;

-- Class names are free text on events ('IOM', 'DF95', '10 Rater'); boats use a fixed list.
CREATE OR REPLACE FUNCTION public.whats_on_class_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE k
           WHEN '' THEN NULL
           WHEN '10rater' THEN '10r' WHEN 'tenrater' THEN '10r' WHEN '10raters' THEN '10r'
           WHEN 'internationalonemetre' THEN 'iom' WHEN 'onemetre' THEN 'iom' WHEN 'iomclass' THEN 'iom'
           WHEN 'laser' THEN 'rclaser' WHEN 'rclasers' THEN 'rclaser'
           WHEN 'mclass' THEN 'marblehead' WHEN 'marbleheads' THEN 'marblehead'
           WHEN 'a' THEN 'aclass' WHEN 'aclassyacht' THEN 'aclass'
           WHEN 'dragonflite65' THEN 'df65' WHEN 'dragonflite95' THEN 'df95'
           ELSE k END
  FROM (SELECT lower(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) AS k) s
$$;

CREATE OR REPLACE FUNCTION public.whats_on_class_color(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
           WHEN 'iom' THEN '#2E7BFF' WHEN 'df95' THEN '#8A4DFF' WHEN 'df65' THEN '#FF8A2B'
           WHEN '10r' THEN '#30D158' WHEN 'marblehead' THEN '#FF3E9A' WHEN 'aclass' THEN '#0A84FF'
           WHEN 'rclaser' THEN '#FFB340' ELSE '#64748B' END
$$;

CREATE OR REPLACE FUNCTION public.whats_on_hex(p text, p_default text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(p, '') ~ '^#[0-9A-Fa-f]{6}$' THEN p ELSE p_default END
$$;

CREATE OR REPLACE FUNCTION public.whats_on_list_text(p text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE coalesce(array_length(p, 1), 0)
           WHEN 0 THEN ''
           WHEN 1 THEN p[1]
           ELSE array_to_string(p[1:array_length(p, 1) - 1], ', ') || ' and ' || p[array_length(p, 1)] END
$$;

CREATE OR REPLACE FUNCTION public.whats_on_fmt_time(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(p, '') ~ '^\d{1,2}:\d{2}'
              THEN lower(to_char(('2000-01-01 ' || substring(p from '^\d{1,2}:\d{2}'))::timestamp, 'FMHH12:MI am'))
         END
$$;

CREATE OR REPLACE FUNCTION public.whats_on_initials(p_first text, p_last text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(left(coalesce(nullif(trim(p_first), ''), '?'), 1) || left(coalesce(trim(p_last), ''), 1))
$$;

CREATE OR REPLACE FUNCTION public.whats_on_money(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN NULL
              WHEN p = trunc(p) THEN '$' || trunc(p)::text
              ELSE '$' || to_char(p, 'FM999990.00') END
$$;

CREATE OR REPLACE FUNCTION public.whats_on_app_url()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    SELECT value::text INTO v FROM platform_settings
    WHERE category = 'mobile_app' AND key = 'web_app_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  v := trim(both '"' from coalesce(v, ''));
  IF v !~ '^https?://' THEN
    v := 'https://app.alfiepro.com.au';
  END IF;
  RETURN rtrim(v, '/');
END;
$$;

-- Same rule as activate-member-account: club admin / editor, or a super admin.
CREATE OR REPLACE FUNCTION public.whats_on_can_manage(p_club uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_club IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
           SELECT 1 FROM user_clubs uc
           WHERE uc.club_id::text = p_club::text
             AND uc.user_id = auth.uid()
             AND uc.role IN ('admin', 'super_admin', 'editor'))
      OR EXISTS (
           SELECT 1 FROM profiles p
           WHERE p.id = auth.uid() AND coalesce((to_jsonb(p) ->> 'is_super_admin')::boolean, false));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.whats_on_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  send_day smallint NOT NULL DEFAULT 1 CHECK (send_day BETWEEN 0 AND 6),   -- 0 = Sunday
  send_time time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'Australia/Sydney',
  covers_days smallint NOT NULL DEFAULT 7 CHECK (covers_days IN (7, 14)),
  skip_empty boolean NOT NULL DEFAULT true,
  audience text NOT NULL DEFAULT 'class' CHECK (audience IN ('class', 'all')),
  include_unactivated boolean NOT NULL DEFAULT true,
  include_unfinancial boolean NOT NULL DEFAULT false,
  show_rsvp boolean NOT NULL DEFAULT true,
  show_details boolean NOT NULL DEFAULT true,
  show_docs boolean NOT NULL DEFAULT true,
  show_other boolean NOT NULL DEFAULT true,
  show_next_week boolean NOT NULL DEFAULT true,
  show_alfie_panel boolean NOT NULL DEFAULT true,
  help_enabled boolean NOT NULL DEFAULT false,
  help_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  help_title text,
  help_show_phone boolean NOT NULL DEFAULT true,
  help_show_email boolean NOT NULL DEFAULT true,
  help_email text,
  brand_color text,
  accent_color text,
  subject text,
  intro text,
  last_sent_at timestamptz,
  last_scheduled_at timestamptz,
  last_run_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.whats_on_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Club admins can read What's On settings" ON public.whats_on_settings;
CREATE POLICY "Club admins can read What's On settings" ON public.whats_on_settings
  FOR SELECT TO authenticated USING (public.whats_on_can_manage(club_id));

CREATE TABLE IF NOT EXISTS public.whats_on_tokens (
  token text PRIMARY KEY,
  member_id uuid NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whats_on_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.whats_on_member_prefs (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  whats_on_enabled boolean NOT NULL DEFAULT true,
  scope text NOT NULL DEFAULT 'classes' CHECK (scope IN ('classes', 'all')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whats_on_member_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Club admins can read member email preferences" ON public.whats_on_member_prefs;
CREATE POLICY "Club admins can read member email preferences" ON public.whats_on_member_prefs
  FOR SELECT TO authenticated USING (public.whats_on_can_manage(club_id));

CREATE TABLE IF NOT EXISTS public.whats_on_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  event_id uuid,
  series_id uuid,
  round_name text,
  status text NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_id IS NOT NULL OR series_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS whats_on_answers_member_event_key
  ON public.whats_on_answers (member_id, coalesce(event_id::text, ''), coalesce(series_id::text, ''), coalesce(round_name, ''));
CREATE INDEX IF NOT EXISTS whats_on_answers_event_idx ON public.whats_on_answers (event_id);
CREATE INDEX IF NOT EXISTS whats_on_answers_series_idx ON public.whats_on_answers (series_id, round_name);
ALTER TABLE public.whats_on_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Club members can see email answers" ON public.whats_on_answers;
CREATE POLICY "Club members can see email answers" ON public.whats_on_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_clubs uc
                 WHERE uc.user_id = auth.uid() AND uc.club_id::text = whats_on_answers.club_id::text));

CREATE TABLE IF NOT EXISTS public.whats_on_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('scheduled', 'now', 'test')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  period_from date,
  period_to date,
  recipients integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  unactivated integer NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  sent_by uuid
);
CREATE INDEX IF NOT EXISTS whats_on_sends_club_idx ON public.whats_on_sends (club_id, sent_at DESC);
ALTER TABLE public.whats_on_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Club admins can read What's On sends" ON public.whats_on_sends;
CREATE POLICY "Club admins can read What's On sends" ON public.whats_on_sends
  FOR SELECT TO authenticated USING (public.whats_on_can_manage(club_id));

CREATE TABLE IF NOT EXISTS public.whats_on_send_recipients (
  send_id uuid NOT NULL REFERENCES public.whats_on_sends(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  activated boolean NOT NULL DEFAULT false,
  PRIMARY KEY (send_id, member_id)
);
ALTER TABLE public.whats_on_send_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.whats_on_answer_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  member_id uuid NOT NULL,
  event_key text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whats_on_answer_log_club_idx ON public.whats_on_answer_log (club_id, created_at DESC);
ALTER TABLE public.whats_on_answer_log ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Settings (defaults merged with the saved row and any unsaved edits)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_cfg(p_club uuid, p_override jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_state text;
  v_tz text;
  v_cfg jsonb;
  v_row jsonb;
  v_allowed text[] := ARRAY['enabled', 'frequency', 'send_day', 'send_time', 'timezone', 'covers_days',
    'skip_empty', 'audience', 'include_unactivated', 'include_unfinancial', 'show_rsvp', 'show_details',
    'show_docs', 'show_other', 'show_next_week', 'show_alfie_panel', 'help_enabled', 'help_member_id',
    'help_title', 'help_show_phone', 'help_show_email', 'help_email', 'brand_color', 'accent_color',
    'subject', 'intro'];
BEGIN
  SELECT upper(coalesce(to_jsonb(c) ->> 'state', '')) INTO v_state FROM clubs c WHERE c.id = p_club;
  v_tz := CASE
            WHEN v_state IN ('VIC', 'VICTORIA') THEN 'Australia/Melbourne'
            WHEN v_state IN ('QLD', 'QUEENSLAND') THEN 'Australia/Brisbane'
            WHEN v_state IN ('SA', 'SOUTH AUSTRALIA') THEN 'Australia/Adelaide'
            WHEN v_state IN ('WA', 'WESTERN AUSTRALIA') THEN 'Australia/Perth'
            WHEN v_state IN ('TAS', 'TASMANIA') THEN 'Australia/Hobart'
            WHEN v_state IN ('NT', 'NORTHERN TERRITORY') THEN 'Australia/Darwin'
            WHEN v_state IN ('NZ', 'NEW ZEALAND') THEN 'Pacific/Auckland'
            ELSE 'Australia/Sydney' END;

  v_cfg := jsonb_build_object(
    'club_id', p_club, 'enabled', false, 'frequency', 'weekly', 'send_day', 1, 'send_time', '08:00',
    'timezone', v_tz, 'covers_days', 7, 'skip_empty', true, 'audience', 'class',
    'include_unactivated', true, 'include_unfinancial', false, 'show_rsvp', true, 'show_details', true,
    'show_docs', true, 'show_other', true, 'show_next_week', true, 'show_alfie_panel', true,
    'help_enabled', false, 'help_show_phone', true, 'help_show_email', true, 'saved', false);

  SELECT to_jsonb(s) INTO v_row FROM whats_on_settings s WHERE s.club_id = p_club;
  IF v_row IS NOT NULL THEN
    v_row := jsonb_set(v_row, '{send_time}', to_jsonb(left(v_row ->> 'send_time', 5)));
    v_cfg := v_cfg || jsonb_strip_nulls(v_row) || jsonb_build_object('saved', true);
  END IF;

  IF p_override IS NOT NULL AND jsonb_typeof(p_override) = 'object' THEN
    v_cfg := v_cfg || coalesce((SELECT jsonb_object_agg(key, value) FROM jsonb_each(p_override)
                                WHERE key = ANY (v_allowed)), '{}'::jsonb);
  END IF;

  -- Keep values in range so a bad edit can never break a send
  IF coalesce(v_cfg ->> 'frequency', '') NOT IN ('weekly', 'fortnightly', 'monthly') THEN v_cfg := v_cfg || '{"frequency":"weekly"}'; END IF;
  IF coalesce(v_cfg ->> 'audience', '') NOT IN ('class', 'all') THEN v_cfg := v_cfg || '{"audience":"class"}'; END IF;
  IF coalesce(v_cfg ->> 'covers_days', '') NOT IN ('7', '14') THEN v_cfg := v_cfg || '{"covers_days":7}'; END IF;
  IF coalesce(v_cfg ->> 'send_day', '') !~ '^[0-6]$' THEN v_cfg := v_cfg || '{"send_day":1}'; END IF;
  IF coalesce(v_cfg ->> 'send_time', '') !~ '^([01]\d|2[0-3]):[0-5]\d' THEN v_cfg := v_cfg || '{"send_time":"08:00"}'; END IF;
  v_cfg := jsonb_set(v_cfg, '{send_time}', to_jsonb(left(v_cfg ->> 'send_time', 5)));
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_cfg ->> 'timezone') THEN
    v_cfg := jsonb_set(v_cfg, '{timezone}', to_jsonb(v_tz));
  END IF;
  IF coalesce(v_cfg ->> 'help_member_id', '') !~ '^[0-9a-fA-F-]{36}$' THEN v_cfg := v_cfg - 'help_member_id'; END IF;
  RETURN v_cfg;
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_club_info(p_club uuid, p_cfg jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  c jsonb;
BEGIN
  SELECT to_jsonb(cl) INTO c FROM clubs cl WHERE cl.id = p_club;
  IF c IS NULL THEN
    RETURN NULL;
  END IF;
  v := jsonb_build_object(
    'id', p_club,
    'name', coalesce(nullif(trim(c ->> 'name'), ''), 'Your club'),
    'abbr', coalesce(nullif(trim(c ->> 'abbreviation'), ''), nullif(trim(c ->> 'name'), ''), 'Club'),
    'logo', CASE WHEN coalesce(c ->> 'logo', '') ~ '^https://' THEN c ->> 'logo' END,
    'color', public.whats_on_hex(coalesce(p_cfg ->> 'brand_color', c ->> 'primary_color'), '#0B2A5B'),
    'accent', public.whats_on_hex(p_cfg ->> 'accent_color', '#0A84FF'),
    'email', coalesce(nullif(trim(c ->> 'contact_email'), ''), nullif(trim(c ->> 'email'), '')),
    'address', nullif(trim(concat_ws(', ', nullif(trim(c ->> 'address'), ''), nullif(trim(c ->> 'city'), ''), nullif(trim(c ->> 'state'), ''))), ''),
    'app_url', public.whats_on_app_url());
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_help(p_club uuid, p_cfg jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
BEGIN
  IF NOT coalesce((p_cfg ->> 'help_enabled')::boolean, false) OR p_cfg ->> 'help_member_id' IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT mm.first_name, mm.last_name, mm.email, mm.phone INTO m
  FROM members mm
  WHERE mm.id = (p_cfg ->> 'help_member_id')::uuid AND mm.club_id::text = p_club::text;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'name', trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
    'first_name', m.first_name,
    'initials', public.whats_on_initials(m.first_name, m.last_name),
    'title', nullif(trim(p_cfg ->> 'help_title'), ''),
    'phone', CASE WHEN coalesce((p_cfg ->> 'help_show_phone')::boolean, true) THEN nullif(trim(m.phone), '') END,
    'email', CASE WHEN coalesce((p_cfg ->> 'help_show_email')::boolean, true)
                  THEN coalesce(nullif(trim(p_cfg ->> 'help_email'), ''), nullif(trim(m.email), '')) END));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Events for a club in a date window
-- ════════════════════════════════════════════════════════════════════════════
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
    SELECT to_jsonb(qr) AS j FROM quick_races qr WHERE qr.club_id::text = p_club::text
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
      AND NOT EXISTS (SELECT 1 FROM tr
                      WHERE tr.j ->> 'series_id' = s.j ->> 'id'
                        AND tr.j ->> 'round_name' = coalesce(nullif(e.r ->> 'name', ''), e.r ->> 'roundName'))
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

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Members: who gets it, their boats and their answers
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_recipient_ids(p_club uuid, p_cfg jsonb)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id
  FROM members m
  WHERE m.club_id::text = p_club::text
    AND coalesce(m.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND coalesce(to_jsonb(m) ->> 'membership_status', 'active') IN ('active', 'expired')
    AND (coalesce((p_cfg ->> 'include_unfinancial')::boolean, false) OR coalesce((to_jsonb(m) ->> 'is_financial')::boolean, false))
    AND (coalesce((p_cfg ->> 'include_unactivated')::boolean, true)
         OR (m.user_id IS NOT NULL AND coalesce(to_jsonb(m) ->> 'activation_status', '') <> 'pending'))
    AND NOT EXISTS (SELECT 1 FROM whats_on_member_prefs p WHERE p.member_id = m.id AND NOT p.whats_on_enabled)
  ORDER BY m.last_name, m.first_name
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
             ea.status AS st, 1 AS pri
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

CREATE OR REPLACE FUNCTION public.whats_on_member_token(p_member uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v text;
BEGIN
  SELECT token INTO v FROM whats_on_tokens WHERE member_id = p_member;
  IF v IS NULL THEN
    INSERT INTO whats_on_tokens (token, member_id, club_id)
    SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), m.id, m.club_id
    FROM members m WHERE m.id = p_member
    ON CONFLICT (member_id) DO NOTHING;
    SELECT token INTO v FROM whats_on_tokens WHERE member_id = p_member;
  END IF;
  RETURN v;
END;
$$;

-- Which of this week's events are "mine": my classes, or everything for "all" audiences.
CREATE OR REPLACE FUNCTION public.whats_on_is_mine(p_event jsonb, p_member jsonb, p_cfg jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_event ->> 'kind' <> 'meeting'
     AND (   coalesce(p_cfg ->> 'audience', 'class') = 'all'
          OR coalesce(p_member ->> 'scope', 'classes') = 'all'
          OR p_event ->> 'class_key' IS NULL
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_member -> 'boats', '[]'::jsonb)) b
                     WHERE b ->> 'key' = p_event ->> 'class_key'))
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Email HTML
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_card_html(e jsonb, m jsonb, cfg jsonb, ctx jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  d date := (e ->> 'event_date')::date;
  d2 date := (e ->> 'end_date')::date;
  v_first boolean := coalesce((ctx ->> 'first')::boolean, false);
  v_status text := m -> 'answers' ->> (e ->> 'event_key');
  v_accent text := ctx ->> 'accent';
  v_disp text := 'font-family:''Bricolage Grotesque'',-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;';
  v_pill text := 'display:inline-block;height:22px;line-height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;white-space:nowrap;margin:0 6px 6px 0;vertical-align:middle;';
  v_meta text := 'font-size:13.5px;line-height:1.5;color:#475569;margin:0 0 4px;';
  v_link text := 'color:#0A64D8;text-decoration:none;font-weight:600;';
  v_base text;
  v_boat text;
  v_badge text;
  v_h text := '';
  v_labels text := '';
  v_going int := coalesce((e ->> 'going')::int, 0);
  v_cant int := coalesce((e ->> 'cant')::int, 0);
  v_fmt_color text;
BEGIN
  IF coalesce((ctx ->> 'preview')::boolean, false) OR ctx ->> 'token' IS NULL THEN
    v_base := NULL;
  ELSE
    v_base := (ctx ->> 'app_url') || '/whats-on/answer?t=' || (ctx ->> 'token') || '&e=' || public.whats_on_urlencode(e ->> 'event_key');
  END IF;

  SELECT b ->> 'label' INTO v_boat
  FROM jsonb_array_elements(coalesce(m -> 'boats', '[]'::jsonb)) b
  WHERE b ->> 'key' = e ->> 'class_key' AND coalesce(b ->> 'label', '') <> ''
  LIMIT 1;

  -- Date badge (the first event gets the Spectrum rim)
  v_badge := '<td align="center" style="padding:9px 0 8px;border-radius:13px;background:' || CASE WHEN v_first THEN '#FFFFFF' ELSE '#F6F8FB' END
    || ';font-size:11px;font-weight:600;letter-spacing:0.08em;color:#64748B;line-height:1.3">' || upper(to_char(d, 'Dy'))
    || '<br><span style="' || v_disp || 'font-size:26px;font-weight:700;color:#0B1220;line-height:1.15">' || to_char(d, 'FMDD') || '</span><br>'
    || upper(to_char(d, 'Mon')) || '</td>';
  IF v_first THEN
    v_badge := '<table role="presentation" width="64" cellpadding="0" cellspacing="0" border="0" style="width:64px;border-collapse:separate"><tr><td style="padding:2px;border-radius:15px;background:#8A4DFF;background-image:linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%)">'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' || v_badge || '</tr></table></td></tr></table>';
  ELSE
    v_badge := '<table role="presentation" width="64" cellpadding="0" cellspacing="0" border="0" style="width:64px;border:1px solid #E3E8F0;border-radius:14px;border-collapse:separate;background:#F6F8FB"><tr>' || v_badge || '</tr></table>';
  END IF;

  -- Labels
  IF v_first THEN
    v_labels := v_labels || '<span style="display:inline-block;margin:0 8px 6px 0;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#8A4DFF;vertical-align:middle">Next up</span>';
  END IF;
  IF e ->> 'race_class' IS NOT NULL THEN
    v_labels := v_labels || '<span style="display:inline-block;height:22px;line-height:22px;padding:0 8px;border-radius:7px;border:1px solid #D9E0EA;background:#FFFFFF;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#0B1220;margin:0 6px 6px 0;vertical-align:middle;white-space:nowrap">'
      || '<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:' || public.whats_on_class_color(e ->> 'class_key') || ';margin-right:6px;vertical-align:middle"></span>'
      || public.whats_on_esc(e ->> 'race_class') || '</span>';
  END IF;
  IF e ->> 'race_format' IS NOT NULL THEN
    v_fmt_color := CASE WHEN lower(e ->> 'race_format') LIKE '%handicap%' THEN '#FFB340'
                        WHEN lower(e ->> 'race_format') LIKE '%scratch%' THEN '#30D158' ELSE '#8A4DFF' END;
    v_labels := v_labels || '<span style="' || v_pill || 'background:#F1F4F9;color:#334155;font-weight:500">'
      || '<span style="display:inline-block;width:7px;height:7px;border-radius:999px;background:' || v_fmt_color || ';margin-right:6px;vertical-align:middle"></span>'
      || public.whats_on_esc(initcap(e ->> 'race_format')) || '</span>';
  END IF;
  IF coalesce((e ->> 'is_paid')::boolean, false) THEN
    v_labels := v_labels || '<span style="' || v_pill || 'background:#FFF4E5;color:#8A5300;font-weight:600">Entry '
      || public.whats_on_esc(public.whats_on_money((e ->> 'entry_fee')::numeric)) || '</span>';
  END IF;
  IF v_boat IS NOT NULL THEN
    v_labels := v_labels || '<span style="' || v_pill || 'background:#EAF3FF;color:#0A5CC2;font-weight:600">Your boat · ' || public.whats_on_esc(v_boat) || '</span>';
  END IF;
  IF v_labels <> '' THEN
    v_h := v_h || '<div style="margin:0 0 4px;line-height:28px">' || v_labels || '</div>';
  END IF;

  v_h := v_h || '<div style="' || v_disp || 'font-size:19px;font-weight:600;line-height:1.25;color:#0B1220;margin:0 0 10px">' || public.whats_on_esc(e ->> 'title') || '</div>';

  -- Details
  IF coalesce((cfg ->> 'show_details')::boolean, true) THEN
    IF d2 IS NOT NULL AND d2 > d THEN
      v_h := v_h || '<div style="' || v_meta || '">' || to_char(d, 'Dy FMDD Mon') || ' – ' || to_char(d2, 'Dy FMDD Mon') || '</div>';
    END IF;
    IF e ->> 'venue' IS NOT NULL THEN
      v_h := v_h || '<div style="' || v_meta || '">' || public.whats_on_esc(e ->> 'venue')
        || CASE WHEN e ->> 'map_url' IS NOT NULL
                THEN ' · <a href="' || public.whats_on_esc(e ->> 'map_url') || '" style="' || v_link || '">Map</a>' ELSE '' END || '</div>';
    END IF;
    IF e ->> 'start_time' IS NOT NULL THEN
      v_h := v_h || '<div style="' || v_meta || '">First start ' || public.whats_on_esc(e ->> 'start_time') || '</div>';
    END IF;
    IF e ->> 'pro_name' IS NOT NULL THEN
      v_h := v_h || '<div style="' || v_meta || '"><span style="display:inline-block;height:18px;line-height:18px;padding:0 6px;border-radius:5px;background:#0B1220;color:#FFFFFF;font-size:10px;font-weight:700;letter-spacing:0.06em;margin-right:8px;vertical-align:middle">PRO</span>'
        || public.whats_on_esc(e ->> 'pro_name') || '</div>';
    END IF;
  END IF;
  IF coalesce((cfg ->> 'show_rsvp')::boolean, true) THEN
    v_h := v_h || '<div style="' || v_meta || '">'
      || CASE WHEN v_going = 0 THEN 'Nobody has said they''re going yet'
              ELSE v_going || ' going' || CASE WHEN v_cant > 0 THEN ' · ' || v_cant || ' can&#39;t make it' ELSE ' so far' END END
      || '</div>';
  END IF;
  IF coalesce((cfg ->> 'show_docs')::boolean, true) AND (e ->> 'nor_url' IS NOT NULL OR e ->> 'si_url' IS NOT NULL) THEN
    v_h := v_h || '<div style="' || v_meta || '">'
      || concat_ws(' · ',
           CASE WHEN e ->> 'nor_url' IS NOT NULL THEN '<a href="' || public.whats_on_esc(e ->> 'nor_url') || '" style="' || v_link || '">Notice of Race</a>' END,
           CASE WHEN e ->> 'si_url' IS NOT NULL THEN '<a href="' || public.whats_on_esc(e ->> 'si_url') || '" style="' || v_link || '">Sailing Instructions</a>' END)
      || '</div>';
  END IF;

  -- Answer buttons, or the answer already given
  IF coalesce((cfg ->> 'show_rsvp')::boolean, true) THEN
    IF v_status IS NOT NULL THEN
      v_h := v_h || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-collapse:separate"><tr><td style="padding:10px 12px;border-radius:12px;font-size:13.5px;font-weight:500;'
        || CASE v_status WHEN 'yes' THEN 'background:#EAF8EF;color:#136C34">&#10003;&nbsp; You&#39;re going'
                         WHEN 'no' THEN 'background:#F1F4F9;color:#475569">You can&#39;t make it'
                         ELSE 'background:#FFF6E5;color:#8A5300">You said maybe' END
        || ' · <a href="' || public.whats_on_esc(coalesce(v_base, '#')) || '" style="color:inherit;font-weight:600">Change</a></td></tr></table>';
    ELSE
      v_h := v_h || '<div style="margin-top:12px">'
        || '<a class="wo-btn" href="' || public.whats_on_esc(coalesce(v_base || '&a=yes', '#')) || '" style="display:inline-block;background:' || v_accent || ';color:#FFFFFF;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:11px 18px;border-radius:12px;margin:0 8px 8px 0">&#10003;&nbsp; I&#39;m going</a>'
        || '<a class="wo-btn" href="' || public.whats_on_esc(coalesce(v_base || '&a=no', '#')) || '" style="display:inline-block;background:#FFFFFF;border:1px solid #D3DAE5;color:#0B1220;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:10px 18px;border-radius:12px;margin:0 8px 8px 0">Can&#39;t make it</a>'
        || '<a class="wo-btn" href="' || public.whats_on_esc(coalesce(v_base || '&a=maybe', '#')) || '" style="display:inline-block;color:#475569;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:11px 10px;margin:0 0 8px 0">Maybe</a>'
        || '</div>';
    END IF;
  END IF;

  RETURN '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3E8F0;border-radius:16px;background:#FFFFFF;border-collapse:separate"><tr>'
    || '<td class="wo-dt" valign="top" width="64" style="width:64px;padding:18px 0 18px 18px">' || v_badge || '</td>'
    || '<td valign="top" style="padding:16px 18px 12px 16px">' || v_h || '</td></tr></table>'
    || '<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>';
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_render(
  p_club jsonb, p_cfg jsonb, p_member jsonb, p_week jsonb, p_next jsonb,
  p_from date, p_to date, p_token text, p_preview boolean, p_help jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_app text := p_club ->> 'app_url';
  v_accent text := p_club ->> 'accent';
  v_color text := p_club ->> 'color';
  v_abbr text := p_club ->> 'abbr';
  v_disp text := 'font-family:''Bricolage Grotesque'',-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.025em;';
  v_font text := 'font-family:''Instrument Sans'',-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;';
  v_link text := 'color:#0A64D8;text-decoration:none;';
  v_mine jsonb;
  v_other jsonb;
  v_next_mine jsonb;
  v_count int;
  v_classes text[];
  v_class_text text;
  v_period text;
  v_range text;
  v_subject text;
  v_intro text;
  v_h1 text;
  v_sub text;
  v_cards text := '';
  v_other_html text := '';
  v_next_html text := '';
  v_panel text := '';
  v_help_html text := '';
  v_footer text;
  v_html text;
  v_page text;
  v_activate text;
  v_e jsonb;
  v_i int := 0;
  v_items text[];
  v_preheader text;
  v_all_audience boolean;
BEGIN
  v_all_audience := coalesce(p_cfg ->> 'audience', 'class') = 'all' OR coalesce(p_member ->> 'scope', 'classes') = 'all';

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_mine
  FROM jsonb_array_elements(coalesce(p_week, '[]'::jsonb)) x WHERE public.whats_on_is_mine(x, p_member, p_cfg);
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_other
  FROM jsonb_array_elements(coalesce(p_week, '[]'::jsonb)) x WHERE NOT public.whats_on_is_mine(x, p_member, p_cfg);
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_next_mine
  FROM jsonb_array_elements(coalesce(p_next, '[]'::jsonb)) x WHERE public.whats_on_is_mine(x, p_member, p_cfg);
  v_count := jsonb_array_length(v_mine);

  SELECT coalesce(array_agg(DISTINCT b ->> 'class'), ARRAY[]::text[]) INTO v_classes
  FROM jsonb_array_elements(coalesce(p_member -> 'boats', '[]'::jsonb)) b;
  v_class_text := public.whats_on_list_text(v_classes);

  v_period := CASE WHEN (p_cfg ->> 'covers_days')::int = 14 THEN 'in the next two weeks' ELSE 'this week' END;
  v_range := CASE WHEN to_char(p_from, 'YYYYMM') = to_char(p_to, 'YYYYMM')
                  THEN to_char(p_from, 'Dy FMDD') || ' – ' || to_char(p_to, 'Dy FMDD FMMonth')
                  ELSE to_char(p_from, 'Dy FMDD FMMonth') || ' – ' || to_char(p_to, 'Dy FMDD FMMonth') END;

  -- Subject
  v_subject := nullif(trim(p_cfg ->> 'subject'), '');
  IF v_subject IS NULL THEN
    v_subject := CASE
      WHEN v_count = 0 THEN 'What''s On at ' || v_abbr || ' ' || v_period
      WHEN NOT v_all_audience AND v_class_text <> '' THEN v_count || CASE WHEN v_count = 1 THEN ' race ' ELSE ' races ' END || v_period || ' for your ' || v_class_text
      ELSE v_count || CASE WHEN v_count = 1 THEN ' race at ' ELSE ' races at ' END || v_abbr || ' ' || v_period END;
  END IF;

  v_intro := coalesce(nullif(trim(p_cfg ->> 'intro'), ''),
    'Hi {first_name}, here''s what''s on at the club ' || v_period
    || CASE WHEN v_all_audience THEN '.' ELSE ' for your boats.' END
    || CASE WHEN coalesce((p_cfg ->> 'show_rsvp')::boolean, true) THEN ' Tap Going or Can''t make it so the PRO can plan the starts.' ELSE '' END);

  -- Merge tags
  v_subject := replace(replace(replace(replace(replace(v_subject,
    '{first_name}', p_member ->> 'first_name'), '{club_name}', p_club ->> 'name'), '{week_range}', v_range),
    '{event_count}', v_count::text), '{classes}', coalesce(nullif(v_class_text, ''), 'boats'));
  v_intro := replace(replace(replace(replace(replace(v_intro,
    '{first_name}', p_member ->> 'first_name'), '{club_name}', p_club ->> 'name'), '{week_range}', v_range),
    '{event_count}', v_count::text), '{classes}', coalesce(nullif(v_class_text, ''), 'boats'));

  v_h1 := CASE WHEN v_count = 0 THEN 'Nothing on for your boats ' || v_period
               ELSE v_count || CASE WHEN v_count = 1 THEN ' race ' ELSE ' races ' END || v_period END;
  IF v_count = 0 AND v_all_audience THEN
    v_h1 := 'No racing ' || v_period;
  END IF;
  v_sub := CASE
    WHEN v_all_audience OR v_class_text = '' THEN 'At ' || public.whats_on_esc(p_club ->> 'name')
    ELSE 'For your ' || public.whats_on_list_text(ARRAY(SELECT '<strong style="color:#FFFFFF;font-weight:600">' || public.whats_on_esc(c) || '</strong>' FROM unnest(v_classes) c)) END
    || CASE WHEN v_count > 0 AND coalesce((p_cfg ->> 'show_rsvp')::boolean, true) THEN ' · let the PRO know if you&#39;re coming' ELSE '' END;

  -- Links
  IF p_preview OR p_token IS NULL THEN
    v_page := '#';
  ELSE
    v_page := v_app || '/whats-on/answer?t=' || p_token;
  END IF;
  v_activate := CASE
    WHEN p_preview THEN '#'
    WHEN coalesce((p_member ->> 'pending')::boolean, false) THEN v_app || '/forgot-password?email=' || public.whats_on_urlencode(p_member ->> 'email')
    ELSE v_app || '/register?email=' || public.whats_on_urlencode(p_member ->> 'email') END;

  -- Event cards
  FOR v_e IN SELECT x FROM jsonb_array_elements(v_mine) x LOOP
    v_cards := v_cards || public.whats_on_card_html(v_e, p_member, p_cfg,
      jsonb_build_object('first', v_i = 0, 'token', p_token, 'app_url', v_app, 'preview', p_preview, 'accent', v_accent));
    v_i := v_i + 1;
  END LOOP;
  IF v_count = 0 THEN
    v_cards := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px dashed #D3DAE5;border-radius:16px;border-collapse:separate"><tr><td style="padding:22px;font-size:14px;line-height:1.55;color:#475569">'
      || 'There&#39;s no racing on the calendar for your boats ' || v_period || '.'
      || '</td></tr></table><div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>';
  END IF;

  -- Also at the club
  IF coalesce((p_cfg ->> 'show_other')::boolean, true) AND jsonb_array_length(v_other) > 0 THEN
    v_other_html := '<div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748B;margin:6px 2px 2px">Also at the club ' || v_period || '</div>';
    FOR v_e IN SELECT x FROM jsonb_array_elements(v_other) x LOOP
      v_other_html := v_other_html
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EEF2F7"><tr>'
        || '<td valign="top" width="44" style="width:44px;padding:12px 0 12px 2px;font-size:12px;font-weight:600;color:#64748B;line-height:1.3">' || upper(to_char((v_e ->> 'event_date')::date, 'Dy'))
        || '<br><span style="' || v_disp || 'font-size:18px;color:#0B1220">' || to_char((v_e ->> 'event_date')::date, 'FMDD') || '</span></td>'
        || '<td valign="top" style="padding:12px 0 12px 12px"><div style="font-size:14px;font-weight:600;color:#0B1220">' || public.whats_on_esc(v_e ->> 'title') || '</div>'
        || coalesce('<div style="font-size:12.5px;color:#64748B;margin-top:2px">' || nullif(concat_ws(' · ',
             public.whats_on_esc(v_e ->> 'venue'),
             CASE WHEN v_e ->> 'start_time' IS NOT NULL THEN public.whats_on_esc(v_e ->> 'start_time') END,
             CASE WHEN v_e ->> 'pro_name' IS NOT NULL THEN 'PRO ' || public.whats_on_esc(v_e ->> 'pro_name') END), '') || '</div>', '')
        || '</td></tr></table>';
    END LOOP;
  END IF;

  -- Next week
  IF coalesce((p_cfg ->> 'show_next_week')::boolean, true) AND jsonb_array_length(v_next_mine) > 0 THEN
    SELECT array_agg(public.whats_on_esc(x ->> 'title') || ' (' || to_char((x ->> 'event_date')::date, 'Dy FMDD') || ')' ORDER BY x ->> 'event_date')
    INTO v_items
    FROM (SELECT x FROM jsonb_array_elements(v_next_mine) x ORDER BY x ->> 'event_date' LIMIT 3) t;
    v_next_html := '<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:14px;background:#F6F8FB;border-collapse:separate"><tr>'
      || '<td style="padding:14px 16px;font-size:13.5px;line-height:1.5;color:#334155"><strong style="color:#0B1220">'
      || CASE WHEN (p_cfg ->> 'covers_days')::int = 14 THEN 'After that:' ELSE 'Next week:' END || '</strong> '
      || public.whats_on_list_text(v_items)
      || CASE WHEN jsonb_array_length(v_next_mine) > 3 THEN ' and ' || (jsonb_array_length(v_next_mine) - 3) || ' more' ELSE '' END
      || '</td><td align="right" valign="middle" style="padding:14px 16px 14px 0;white-space:nowrap">'
      || '<a href="' || CASE WHEN p_preview THEN '#' ELSE public.whats_on_esc(v_app || '/club/' || (p_club ->> 'id') || '/public/race-calendar') END
      || '" style="' || v_link || 'font-size:13.5px;font-weight:600">Full calendar</a></td></tr></table>';
  END IF;

  -- Help contact
  IF p_help IS NOT NULL THEN
    v_help_html := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.12)"><tr>'
      || '<td valign="top" width="36" style="width:36px;padding-top:16px"><div style="width:36px;height:36px;line-height:36px;border-radius:999px;background:#8A4DFF;color:#FFFFFF;text-align:center;' || v_disp || 'font-size:12.5px;font-weight:600">'
      || public.whats_on_esc(p_help ->> 'initials') || '</div></td>'
      || '<td valign="top" style="padding:16px 0 0 12px;font-size:13px;line-height:1.5;color:#C8D0E0">'
      || CASE WHEN coalesce((p_member ->> 'activated')::boolean, false) THEN 'Trouble logging in? ' ELSE 'Need a hand getting set up? ' END
      || '<strong style="color:#FFFFFF;font-weight:600">' || public.whats_on_esc(p_help ->> 'name') || '</strong>'
      || coalesce(', ' || public.whats_on_esc(p_help ->> 'title'), '')
      || CASE WHEN p_help ->> 'phone' IS NOT NULL OR p_help ->> 'email' IS NOT NULL THEN '<br>' ELSE '' END
      || concat_ws(' · ',
           CASE WHEN p_help ->> 'phone' IS NOT NULL THEN '<a href="tel:' || public.whats_on_esc(regexp_replace(p_help ->> 'phone', '[^0-9+]', '', 'g')) || '" style="color:#A9D4FF;text-decoration:none">' || public.whats_on_esc(p_help ->> 'phone') || '</a>' END,
           CASE WHEN p_help ->> 'email' IS NOT NULL THEN '<a href="mailto:' || public.whats_on_esc(p_help ->> 'email') || '" style="color:#A9D4FF;text-decoration:none">' || public.whats_on_esc(p_help ->> 'email') || '</a>' END)
      || '</td></tr></table>';
  END IF;

  -- AlfiePRO panel
  IF coalesce((p_cfg ->> 'show_alfie_panel')::boolean, true) THEN
    v_panel := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td style="padding:2px;border-radius:18px;background:#8A4DFF;background-image:linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%)">'
      || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td class="wo-panel" style="padding:24px;border-radius:16px;background:#0D1424;color:#FFFFFF">'
      || '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      || '<td valign="middle" width="34" style="width:34px"><div style="width:34px;height:34px;border-radius:999px;background:#8A4DFF;background-image:linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%)"></div></td>'
      || '<td valign="middle" style="padding-left:12px"><div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#9AA6BF">'
      || CASE WHEN coalesce((p_member ->> 'activated')::boolean, false) THEN 'You&#39;re on AlfiePRO' ELSE 'Your club runs on AlfiePRO' END
      || '</div><div style="' || v_disp || 'font-size:20px;font-weight:600;line-height:1.25;color:#FFFFFF;margin-top:3px">'
      || CASE WHEN coalesce((p_member ->> 'activated')::boolean, false) THEN 'Entries, results and your boats'
              WHEN coalesce((p_member ->> 'pending')::boolean, false) THEN 'Your login is ready. Set a password and you&#39;re in.'
              ELSE 'Your login is ready. It takes two minutes.' END
      || '</div></td></tr></table>';
    IF coalesce((p_member ->> 'activated')::boolean, false) THEN
      v_panel := v_panel || '<p style="margin:14px 0 18px;font-size:14px;line-height:1.55;color:#C8D0E0">See who&#39;s going, change your answers and check results any time.</p>'
        || '<a class="wo-btn" href="' || CASE WHEN p_preview THEN '#' ELSE public.whats_on_esc(v_app || '/login') END || '" style="display:inline-block;background:#FFFFFF;color:#0B1220;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:11px 18px;border-radius:12px;margin:0 14px 8px 0">Log in to AlfiePRO &rarr;</a>'
        || '<a href="' || CASE WHEN p_preview THEN '#' ELSE public.whats_on_esc(v_app || '/forgot-password?email=' || public.whats_on_urlencode(p_member ->> 'email')) END || '" style="display:inline-block;color:#A9D4FF;font-size:13.5px;font-weight:600;text-decoration:none;padding:11px 0;margin:0 0 8px">Forgot your password?</a>';
    ELSE
      v_panel := v_panel || '<p style="margin:14px 0 16px;font-size:14px;line-height:1.55;color:#C8D0E0">' || public.whats_on_esc(v_abbr)
        || ' uses AlfiePRO to run racing, results and membership. Activate your free login to see everything in one place:</p>'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="wo-feat"><tr>'
        || '<td valign="top" width="50%" style="padding:0 12px 10px 0;font-size:13px;line-height:1.45;color:#D7DEEA"><span style="color:#FF8A2B">&#9679;</span>&nbsp; Results, standings and your race history</td>'
        || '<td valign="top" width="50%" style="padding:0 0 10px 0;font-size:13px;line-height:1.45;color:#D7DEEA"><span style="color:#2E7BFF">&#9679;</span>&nbsp; Race calendar, entries and PRO duties</td></tr><tr>'
        || '<td valign="top" width="50%" style="padding:0 12px 10px 0;font-size:13px;line-height:1.45;color:#D7DEEA"><span style="color:#8A4DFF">&#9679;</span>&nbsp; Your boats, rig settings and maintenance</td>'
        || '<td valign="top" width="50%" style="padding:0 0 10px 0;font-size:13px;line-height:1.45;color:#D7DEEA"><span style="color:#FF3E9A">&#9679;</span>&nbsp; Membership, renewals and receipts</td></tr></table>'
        || '<div style="margin-top:10px"><a class="wo-btn" href="' || public.whats_on_esc(v_activate) || '" style="display:inline-block;background:#FFFFFF;color:#0B1220;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:11px 18px;border-radius:12px;margin:0 14px 8px 0">'
        || CASE WHEN coalesce((p_member ->> 'pending')::boolean, false) THEN 'Set my password' ELSE 'Activate my login' END || ' &rarr;</a>'
        || '<span style="display:inline-block;font-size:12.5px;color:#9AA6BF;padding:6px 0">Use ' || public.whats_on_esc(p_member ->> 'email') || ' · no app to download</span></div>';
    END IF;
    v_panel := v_panel || v_help_html || '</td></tr></table></td></tr></table>';
  ELSIF p_help IS NOT NULL THEN
    v_panel := '<div style="font-size:13px;line-height:1.5;color:#475569">Need a hand? <strong style="color:#0B1220">' || public.whats_on_esc(p_help ->> 'name') || '</strong>'
      || coalesce(' · ' || public.whats_on_esc(p_help ->> 'phone'), '') || coalesce(' · ' || public.whats_on_esc(p_help ->> 'email'), '') || '</div>';
  END IF;

  -- Footer
  v_footer := '<div style="font-weight:600;color:#334155">' || public.whats_on_esc(p_club ->> 'name') || '</div>'
    || CASE WHEN p_club ->> 'address' IS NOT NULL OR p_club ->> 'email' IS NOT NULL
            THEN '<div>' || concat_ws(' · ', public.whats_on_esc(p_club ->> 'address'),
                   CASE WHEN p_club ->> 'email' IS NOT NULL THEN '<a href="mailto:' || public.whats_on_esc(p_club ->> 'email') || '" style="' || v_link || '">' || public.whats_on_esc(p_club ->> 'email') || '</a>' END) || '</div>'
            ELSE '' END
    || '<p style="margin:10px 0 0">You&#39;re getting this because you&#39;re a ' || public.whats_on_esc(v_abbr) || ' member'
    || CASE WHEN NOT v_all_audience AND v_class_text <> ''
            THEN ' with ' || CASE WHEN array_length(v_classes, 1) = 1 THEN CASE WHEN v_classes[1] ~* '^[aeiou]' THEN 'an ' ELSE 'a ' END ELSE 'a ' END
                 || public.whats_on_esc(replace(v_class_text, ' and ', ' or ')) || ' boat in your profile.'
            ELSE '.' END || '</p>'
    || '<p style="margin:4px 0 0"><a href="' || public.whats_on_esc(CASE WHEN v_page = '#' THEN '#' ELSE v_page || '&view=prefs' END) || '" style="' || v_link || '">Email preferences</a> · '
    || '<a href="' || public.whats_on_esc(CASE WHEN v_page = '#' THEN '#' ELSE v_page || '&view=stop' END) || '" style="' || v_link || '">Stop What&#39;s On emails</a> · '
    || '<a href="' || public.whats_on_esc(CASE WHEN v_page = '#' THEN '#' ELSE v_page || '&view=week' END) || '" style="' || v_link || '">View in browser</a></p>'
    || '<div style="margin-top:14px;color:#94A3B8;font-size:11.5px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#8A4DFF;background-image:linear-gradient(135deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%);vertical-align:middle;margin-right:6px"></span>Sent with AlfiePRO</div>';

  v_preheader := CASE WHEN v_count > 0
    THEN (v_mine -> 0 ->> 'title') || ' on ' || to_char((v_mine -> 0 ->> 'event_date')::date, 'Dy FMDD Mon')
         || CASE WHEN v_count > 1 THEN ', and ' || (v_count - 1) || ' more' ELSE '' END
    ELSE 'What''s on at ' || (p_club ->> 'name') || ' ' || v_period END;

  v_html := '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    || '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">'
    || '<title>' || public.whats_on_esc(v_subject) || '</title>'
    || '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">'
    || '<style>body{margin:0;padding:0;background:#EEF2F7}a{color:#0A64D8}'
    || '@media (max-width:620px){.wo-pad{padding-left:20px!important;padding-right:20px!important}.wo-h1{font-size:27px!important}'
    || '.wo-dt{width:54px!important;padding-left:12px!important}.wo-btn{margin-right:6px!important}.wo-feat td{display:block!important;width:100%!important;padding-right:0!important}.wo-panel{padding:20px!important}}</style></head>'
    || '<body style="margin:0;padding:0;background:#EEF2F7">'
    || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' || public.whats_on_esc(v_preheader) || '</div>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2F7"><tr><td align="center" style="padding:24px 10px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E3E8F0;border-collapse:separate;' || v_font || 'color:#0B1220">'
    -- Header
    || '<tr><td class="wo-pad" style="padding:30px 36px 30px;background:' || v_color || ';background-image:linear-gradient(160deg,' || v_color || ' 0%,#060B16 120%);color:#FFFFFF">'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    || '<td valign="middle" width="52" style="width:52px"><div style="width:52px;height:52px;border-radius:14px;background:#FFFFFF;text-align:center;overflow:hidden">'
    || CASE WHEN p_club ->> 'logo' IS NOT NULL
            THEN '<img src="' || public.whats_on_esc(p_club ->> 'logo') || '" width="44" height="44" alt="' || public.whats_on_esc(v_abbr) || '" style="display:inline-block;width:44px;height:44px;margin-top:4px;object-fit:contain;border:0">'
            ELSE '<span style="display:inline-block;line-height:52px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:' || v_color || '">' || public.whats_on_esc(left(v_abbr, 7)) || '</span>' END
    || '</div></td><td valign="middle" style="padding-left:14px"><div style="font-size:14px;font-weight:600;color:#FFFFFF">' || public.whats_on_esc(p_club ->> 'name') || '</div>'
    || '<div style="font-size:12.5px;color:#C9D3E6;margin-top:2px">What&#39;s On · ' || v_range || '</div></td></tr></table>'
    || '<div class="wo-h1" style="' || v_disp || 'margin:26px 0 0;font-size:34px;font-weight:700;line-height:1.1;color:#FFFFFF">' || public.whats_on_esc(v_h1) || '</div>'
    || '<div style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#D5DCEA">' || v_sub || '</div>'
    || '</td></tr>'
    || '<tr><td style="height:3px;line-height:3px;font-size:0;background:#8A4DFF;background-image:linear-gradient(90deg,#2E7BFF 0%,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B 100%)">&nbsp;</td></tr>'
    -- Body
    || '<tr><td class="wo-pad" style="padding:28px 36px 8px">'
    || '<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#334155">' || public.whats_on_esc(v_intro) || '</p>'
    || v_cards || v_other_html || v_next_html
    || '</td></tr>'
    || CASE WHEN v_panel <> '' THEN '<tr><td class="wo-pad" style="padding:20px 36px 28px">' || v_panel || '</td></tr>' ELSE '<tr><td style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>' END
    -- Footer
    || '<tr><td class="wo-pad" style="padding:22px 36px 26px;background:#F4F6FA;border-top:1px solid #E8ECF2;font-size:12.5px;line-height:1.6;color:#64748B">' || v_footer || '</td></tr>'
    || '</table></td></tr></table></body></html>';

  RETURN jsonb_build_object('subject', v_subject, 'html', v_html, 'my_count', v_count, 'event_count', jsonb_array_length(coalesce(p_week, '[]'::jsonb)),
                            'classes', to_jsonb(v_classes), 'range', v_range);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Sending
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_today(p_cfg jsonb)
RETURNS date LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (now() AT TIME ZONE coalesce(p_cfg ->> 'timezone', 'Australia/Sydney'))::date;
EXCEPTION WHEN OTHERS THEN
  RETURN (now() AT TIME ZONE 'Australia/Sydney')::date;
END;
$$;

-- A sample member for previews when the admin has no member record with boats
CREATE OR REPLACE FUNCTION public.whats_on_sample_member(p_week jsonb, p_variant text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'member_id', NULL, 'first_name', 'Sam', 'last_name', 'Sailor', 'email', 'sam@example.com',
    'activated', p_variant = 'activated', 'pending', false, 'scope', 'classes', 'enabled', true,
    'answers', '{}'::jsonb,
    'boats', coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('class', x ->> 'race_class', 'key', x ->> 'class_key', 'label', NULL))
                       FROM jsonb_array_elements(coalesce(p_week, '[]'::jsonb)) x WHERE x ->> 'class_key' IS NOT NULL), '[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.whats_on_send(
  p_club uuid, p_kind text, p_test_email text DEFAULT NULL, p_test_member uuid DEFAULT NULL,
  p_override jsonb DEFAULT NULL, p_variant text DEFAULT 'auto', p_sent_by uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
  v_cfg jsonb;
  v_club jsonb;
  v_help jsonb;
  v_today date;
  v_to date;
  v_week jsonb;
  v_next jsonb := '[]'::jsonb;
  v_member jsonb;
  v_token text;
  v_mail jsonb;
  v_send_id uuid;
  v_sent int := 0;
  v_skipped int := 0;
  v_unact int := 0;
  v_mid uuid;
BEGIN
  IF p_kind NOT IN ('scheduled', 'now', 'test') THEN
    RAISE EXCEPTION 'Unknown send kind %', p_kind;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'Email sending is not set up (vault secrets supabase_url / service_role_key are missing)';
  END IF;

  v_cfg := public.whats_on_cfg(p_club, p_override);
  v_club := public.whats_on_club_info(p_club, v_cfg);
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Club not found';
  END IF;
  v_help := public.whats_on_help(p_club, v_cfg);

  v_today := public.whats_on_today(v_cfg);
  v_to := v_today + ((v_cfg ->> 'covers_days')::int - 1);
  v_week := public.whats_on_events(p_club, v_today, v_to);
  IF coalesce((v_cfg ->> 'show_next_week')::boolean, true) THEN
    v_next := public.whats_on_events(p_club, v_to + 1, v_to + 7);
  END IF;

  IF p_kind = 'test' THEN
    IF coalesce(p_test_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'No email address to send the test to';
    END IF;
    IF p_test_member IS NOT NULL THEN
      v_member := public.whats_on_member_ctx(p_test_member);
      v_token := public.whats_on_member_token(p_test_member);
    END IF;
    IF v_member IS NULL OR jsonb_array_length(v_member -> 'boats') = 0 THEN
      v_member := public.whats_on_sample_member(v_week, p_variant);
      v_token := NULL;
    END IF;
    IF p_variant IN ('activated', 'unactivated') THEN
      v_member := v_member || jsonb_build_object('activated', p_variant = 'activated', 'pending', false);
    END IF;
    v_mail := public.whats_on_render(v_club, v_cfg, v_member, v_week, v_next, v_today, v_to, v_token, false, v_help);
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object(
        'recipients', jsonb_build_array(jsonb_build_object('email', p_test_email, 'name', p_test_email)),
        'subject', '[Test] ' || (v_mail ->> 'subject'),
        'body', v_mail ->> 'html',
        'raw_html', true,
        'type', 'whats_on',
        'club_id', p_club,
        'club_name', v_club ->> 'name',
        'club_logo', v_club ->> 'logo',
        'sender_name', v_club ->> 'name',
        'send_email', true,
        'skip_notifications', true),
      timeout_milliseconds := 30000);
    INSERT INTO whats_on_sends (club_id, kind, period_from, period_to, recipients, event_count, sent_by)
    VALUES (p_club, 'test', v_today, v_to, 1, jsonb_array_length(v_week), p_sent_by);
    RETURN jsonb_build_object('sent', 1, 'to', p_test_email, 'subject', v_mail ->> 'subject');
  END IF;

  INSERT INTO whats_on_sends (club_id, kind, period_from, period_to, event_count, sent_by)
  VALUES (p_club, p_kind, v_today, v_to, jsonb_array_length(v_week), p_sent_by)
  RETURNING id INTO v_send_id;

  FOR v_mid IN SELECT * FROM public.whats_on_recipient_ids(p_club, v_cfg) LOOP
    BEGIN
      v_member := public.whats_on_member_ctx(v_mid);
      IF v_member IS NULL THEN
        CONTINUE;
      END IF;
      -- "Members with a boat in the class" skips members whose boat shed is empty
      IF coalesce(v_cfg ->> 'audience', 'class') = 'class' AND coalesce(v_member ->> 'scope', 'classes') <> 'all'
         AND jsonb_array_length(v_member -> 'boats') = 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      v_token := public.whats_on_member_token(v_mid);
      v_mail := public.whats_on_render(v_club, v_cfg, v_member, v_week, v_next, v_today, v_to, v_token, false, v_help);
      IF (v_mail ->> 'my_count')::int = 0 AND coalesce((v_cfg ->> 'skip_empty')::boolean, true) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      PERFORM net.http_post(
        url := v_url || '/functions/v1/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(jsonb_build_object(
            'email', v_member ->> 'email',
            'name', trim((v_member ->> 'first_name') || ' ' || (v_member ->> 'last_name')))),
          'subject', v_mail ->> 'subject',
          'body', v_mail ->> 'html',
          'raw_html', true,
          'type', 'whats_on',
          'club_id', p_club,
          'club_name', v_club ->> 'name',
          'club_logo', v_club ->> 'logo',
          'sender_name', v_club ->> 'name',
          'send_email', true,
          'skip_notifications', true),
        timeout_milliseconds := 30000);

      INSERT INTO whats_on_send_recipients (send_id, member_id, activated)
      VALUES (v_send_id, v_mid, coalesce((v_member ->> 'activated')::boolean, false))
      ON CONFLICT DO NOTHING;
      v_sent := v_sent + 1;
      IF NOT coalesce((v_member ->> 'activated')::boolean, false) THEN
        v_unact := v_unact + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'whats_on_send: member % skipped: %', v_mid, SQLERRM;
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  UPDATE whats_on_sends SET recipients = v_sent, skipped = v_skipped, unactivated = v_unact WHERE id = v_send_id;
  UPDATE whats_on_settings
  SET last_sent_at = now(),
      last_scheduled_at = CASE WHEN p_kind = 'scheduled' THEN now() ELSE last_scheduled_at END
  WHERE club_id = p_club;

  RETURN jsonb_build_object('sent', v_sent, 'skipped', v_skipped, 'unactivated', v_unact, 'events', jsonb_array_length(v_week), 'send_id', v_send_id);
END;
$$;

-- Hourly: send for every club whose send day and time has come in its own time zone.
CREATE OR REPLACE FUNCTION public.whats_on_run_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  s record;
  v_local timestamp;
  v_runkey text;
  v_count int := 0;
BEGIN
  FOR s IN SELECT * FROM whats_on_settings WHERE enabled LOOP
    BEGIN
      BEGIN
        v_local := now() AT TIME ZONE s.timezone;
      EXCEPTION WHEN OTHERS THEN
        v_local := now() AT TIME ZONE 'Australia/Sydney';
      END;
      CONTINUE WHEN extract(dow FROM v_local)::int <> s.send_day;
      CONTINUE WHEN v_local::time < s.send_time OR (v_local::time - s.send_time) >= interval '3 hours';
      v_runkey := to_char(v_local, 'YYYY-MM-DD');
      CONTINUE WHEN s.last_run_key = v_runkey;
      CONTINUE WHEN s.frequency = 'fortnightly' AND s.last_scheduled_at IS NOT NULL
                AND v_local::date - (s.last_scheduled_at AT TIME ZONE s.timezone)::date < 13;
      CONTINUE WHEN s.frequency = 'monthly' AND extract(day FROM v_local) > 7;

      -- Claim this run before sending so a slow send can never go out twice
      UPDATE whats_on_settings SET last_run_key = v_runkey WHERE club_id = s.club_id;
      PERFORM public.whats_on_send(s.club_id, 'scheduled');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'whats_on_run_due: club % failed: %', s.club_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Admin RPCs (Settings → Email templates)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_settings_get(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg jsonb;
  v_last record;
  v_answers int := 0;
  v_activated int := 0;
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  v_cfg := public.whats_on_cfg(p_club, NULL);

  SELECT * INTO v_last FROM whats_on_sends
  WHERE club_id = p_club AND kind <> 'test'
  ORDER BY sent_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO v_answers FROM whats_on_answer_log WHERE club_id = p_club AND created_at >= v_last.sent_at;
    SELECT count(*) INTO v_activated
    FROM whats_on_send_recipients r JOIN members m ON m.id = r.member_id
    WHERE r.send_id = v_last.id AND NOT r.activated AND m.user_id IS NOT NULL
      AND coalesce(to_jsonb(m) ->> 'activation_status', '') <> 'pending';
  END IF;

  RETURN jsonb_build_object(
    'settings', v_cfg,
    'last_send', CASE WHEN v_last.id IS NOT NULL THEN jsonb_build_object(
       'sent_at', v_last.sent_at, 'kind', v_last.kind, 'recipients', v_last.recipients,
       'skipped', v_last.skipped, 'unactivated', v_last.unactivated, 'answers', v_answers,
       'activated_since', v_activated) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_settings_save(p_club uuid, p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c jsonb;
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  c := public.whats_on_cfg(p_club, p_settings);
  IF c ->> 'help_member_id' IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM members WHERE id = (c ->> 'help_member_id')::uuid AND club_id::text = p_club::text) THEN
    c := c - 'help_member_id';
  END IF;

  INSERT INTO whats_on_settings AS s (
    club_id, enabled, frequency, send_day, send_time, timezone, covers_days, skip_empty, audience,
    include_unactivated, include_unfinancial, show_rsvp, show_details, show_docs, show_other,
    show_next_week, show_alfie_panel, help_enabled, help_member_id, help_title, help_show_phone,
    help_show_email, help_email, brand_color, accent_color, subject, intro, updated_at, updated_by)
  VALUES (
    p_club, (c ->> 'enabled')::boolean, c ->> 'frequency', (c ->> 'send_day')::smallint, (c ->> 'send_time')::time,
    c ->> 'timezone', (c ->> 'covers_days')::smallint, (c ->> 'skip_empty')::boolean, c ->> 'audience',
    (c ->> 'include_unactivated')::boolean, (c ->> 'include_unfinancial')::boolean, (c ->> 'show_rsvp')::boolean,
    (c ->> 'show_details')::boolean, (c ->> 'show_docs')::boolean, (c ->> 'show_other')::boolean,
    (c ->> 'show_next_week')::boolean, (c ->> 'show_alfie_panel')::boolean, (c ->> 'help_enabled')::boolean,
    (c ->> 'help_member_id')::uuid, nullif(trim(c ->> 'help_title'), ''), (c ->> 'help_show_phone')::boolean,
    (c ->> 'help_show_email')::boolean, nullif(trim(c ->> 'help_email'), ''),
    CASE WHEN coalesce(c ->> 'brand_color', '') ~ '^#[0-9A-Fa-f]{6}$' THEN c ->> 'brand_color' END,
    CASE WHEN coalesce(c ->> 'accent_color', '') ~ '^#[0-9A-Fa-f]{6}$' THEN c ->> 'accent_color' END,
    left(nullif(trim(c ->> 'subject'), ''), 200), left(nullif(trim(c ->> 'intro'), ''), 1000), now(), auth.uid())
  ON CONFLICT (club_id) DO UPDATE SET
    enabled = EXCLUDED.enabled, frequency = EXCLUDED.frequency, send_day = EXCLUDED.send_day,
    send_time = EXCLUDED.send_time, timezone = EXCLUDED.timezone, covers_days = EXCLUDED.covers_days,
    skip_empty = EXCLUDED.skip_empty, audience = EXCLUDED.audience,
    include_unactivated = EXCLUDED.include_unactivated, include_unfinancial = EXCLUDED.include_unfinancial,
    show_rsvp = EXCLUDED.show_rsvp, show_details = EXCLUDED.show_details, show_docs = EXCLUDED.show_docs,
    show_other = EXCLUDED.show_other, show_next_week = EXCLUDED.show_next_week,
    show_alfie_panel = EXCLUDED.show_alfie_panel, help_enabled = EXCLUDED.help_enabled,
    help_member_id = EXCLUDED.help_member_id, help_title = EXCLUDED.help_title,
    help_show_phone = EXCLUDED.help_show_phone, help_show_email = EXCLUDED.help_show_email,
    help_email = EXCLUDED.help_email, brand_color = EXCLUDED.brand_color, accent_color = EXCLUDED.accent_color,
    subject = EXCLUDED.subject, intro = EXCLUDED.intro, updated_at = now(), updated_by = auth.uid(),
    -- Changing the send day or time re-arms this week's run
    last_run_key = CASE WHEN s.send_day IS DISTINCT FROM EXCLUDED.send_day OR s.send_time IS DISTINCT FROM EXCLUDED.send_time
                        THEN NULL ELSE s.last_run_key END;

  RETURN public.whats_on_settings_get(p_club);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_preview(p_club uuid, p_settings jsonb DEFAULT NULL, p_member uuid DEFAULT NULL, p_variant text DEFAULT 'auto')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg jsonb;
  v_club jsonb;
  v_today date;
  v_to date;
  v_week jsonb;
  v_next jsonb := '[]'::jsonb;
  v_member jsonb;
  v_mid uuid := p_member;
  v_mail jsonb;
  v_sample boolean := false;
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  v_cfg := public.whats_on_cfg(p_club, p_settings);
  v_club := public.whats_on_club_info(p_club, v_cfg);
  v_today := public.whats_on_today(v_cfg);
  v_to := v_today + ((v_cfg ->> 'covers_days')::int - 1);
  v_week := public.whats_on_events(p_club, v_today, v_to);
  IF coalesce((v_cfg ->> 'show_next_week')::boolean, true) THEN
    v_next := public.whats_on_events(p_club, v_to + 1, v_to + 7);
  END IF;

  -- Default: preview as yourself, if you have boats in this club
  IF v_mid IS NULL THEN
    SELECT m.id INTO v_mid FROM members m
    WHERE m.club_id::text = p_club::text AND m.user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM member_boats b WHERE b.member_id = m.id)
    LIMIT 1;
  END IF;
  IF v_mid IS NOT NULL THEN
    SELECT public.whats_on_member_ctx(m.id) INTO v_member FROM members m
    WHERE m.id = v_mid AND m.club_id::text = p_club::text;
  END IF;
  IF v_member IS NULL OR jsonb_array_length(v_member -> 'boats') = 0 THEN
    v_member := public.whats_on_sample_member(v_week, p_variant);
    v_sample := true;
  END IF;
  IF p_variant IN ('activated', 'unactivated') THEN
    v_member := v_member || jsonb_build_object('activated', p_variant = 'activated', 'pending', false);
  END IF;

  v_mail := public.whats_on_render(v_club, v_cfg, v_member, v_week, v_next, v_today, v_to, NULL, true,
                                   public.whats_on_help(p_club, v_cfg));
  RETURN v_mail || jsonb_build_object(
    'member_name', trim((v_member ->> 'first_name') || ' ' || (v_member ->> 'last_name')),
    'member_classes', (SELECT coalesce(jsonb_agg(DISTINCT b ->> 'class'), '[]'::jsonb) FROM jsonb_array_elements(v_member -> 'boats') b),
    'activated', coalesce((v_member ->> 'activated')::boolean, false),
    'sample', v_sample,
    'from', v_today, 'to', v_to,
    'events', v_week);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_audience(p_club uuid, p_settings jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg jsonb;
  v_today date;
  v_week jsonb;
  v_list jsonb := '[]'::jsonb;
  v_total int := 0;
  v_act int := 0;
  v_with int := 0;
  v_mid uuid;
  v_m jsonb;
  v_has boolean;
  v_mine int;
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  v_cfg := public.whats_on_cfg(p_club, p_settings);
  v_today := public.whats_on_today(v_cfg);
  v_week := public.whats_on_events(p_club, v_today, v_today + ((v_cfg ->> 'covers_days')::int - 1));

  FOR v_mid IN SELECT * FROM public.whats_on_recipient_ids(p_club, v_cfg) LOOP
    v_m := public.whats_on_member_ctx(v_mid);
    v_has := coalesce(v_cfg ->> 'audience', 'class') = 'all' OR v_m ->> 'scope' = 'all' OR jsonb_array_length(v_m -> 'boats') > 0;
    CONTINUE WHEN NOT v_has;
    SELECT count(*) INTO v_mine FROM jsonb_array_elements(v_week) x WHERE public.whats_on_is_mine(x, v_m, v_cfg);
    v_total := v_total + 1;
    IF (v_m ->> 'activated')::boolean THEN v_act := v_act + 1; END IF;
    IF v_mine > 0 OR NOT coalesce((v_cfg ->> 'skip_empty')::boolean, true) THEN v_with := v_with + 1; END IF;
    IF v_total <= 1000 THEN
      v_list := v_list || jsonb_build_array(jsonb_build_object(
        'member_id', v_mid,
        'name', trim((v_m ->> 'first_name') || ' ' || (v_m ->> 'last_name')),
        'email', v_m ->> 'email',
        'activated', (v_m ->> 'activated')::boolean,
        'classes', (SELECT coalesce(jsonb_agg(DISTINCT b ->> 'class'), '[]'::jsonb) FROM jsonb_array_elements(v_m -> 'boats') b),
        'this_week', v_mine));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'activated', v_act, 'unactivated', v_total - v_act,
                            'this_week', v_with, 'members', v_list);
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_send_test(p_club uuid, p_settings jsonb DEFAULT NULL, p_variant text DEFAULT 'auto')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_email text;
  v_mid uuid;
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  SELECT m.id INTO v_mid FROM members m
  WHERE m.club_id::text = p_club::text AND m.user_id = auth.uid()
  ORDER BY (EXISTS (SELECT 1 FROM member_boats b WHERE b.member_id = m.id)) DESC
  LIMIT 1;
  RETURN public.whats_on_send(p_club, 'test', v_email, v_mid, p_settings, coalesce(p_variant, 'auto'), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.whats_on_send_now(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.whats_on_can_manage(p_club) THEN
    RAISE EXCEPTION 'Only club admins can manage What''s On emails' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM whats_on_settings WHERE club_id = p_club) THEN
    RAISE EXCEPTION 'Save the What''s On settings first';
  END IF;
  RETURN public.whats_on_send(p_club, 'now', NULL, NULL, NULL, 'auto', auth.uid());
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Public RPCs: the answer page (token in the email link, no login)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.whats_on_page(p_token text, p_event_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  v_cfg jsonb;
  v_club jsonb;
  v_member jsonb;
  v_today date;
  v_events jsonb;
  v_event jsonb;
  v_week jsonb;
  v_going jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO t FROM whats_on_tokens WHERE token = p_token;
  IF NOT FOUND OR coalesce(p_token, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;
  v_member := public.whats_on_member_ctx(t.member_id);
  IF v_member IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;
  v_cfg := public.whats_on_cfg(t.club_id, NULL);
  v_club := public.whats_on_club_info(t.club_id, v_cfg);
  v_today := public.whats_on_today(v_cfg);
  v_events := public.whats_on_events(t.club_id, v_today - 1, v_today + 120);

  IF p_event_key IS NOT NULL THEN
    SELECT x INTO v_event FROM jsonb_array_elements(v_events) x WHERE x ->> 'event_key' = p_event_key LIMIT 1;
    IF v_event IS NOT NULL THEN
      v_event := v_event || jsonb_build_object('my_status', v_member -> 'answers' ->> p_event_key);
      -- Initials of who's going (first few)
      SELECT coalesce(jsonb_agg(i), '[]'::jsonb) INTO v_going FROM (
        SELECT public.whats_on_initials(m.first_name, m.last_name) AS i
        FROM event_attendance ea
        JOIN members m ON m.user_id = ea.user_id AND m.club_id::text = t.club_id::text
        WHERE ea.status = 'yes'
          AND ((v_event ->> 'kind' = 'event' AND ea.event_id::text = v_event ->> 'event_id')
            OR (v_event ->> 'kind' = 'round' AND ea.series_id::text = v_event ->> 'series_id' AND ea.round_name = v_event ->> 'round_name'))
        UNION ALL
        SELECT public.whats_on_initials(m.first_name, m.last_name)
        FROM whats_on_answers wa JOIN members m ON m.id = wa.member_id
        WHERE wa.status = 'yes'
          AND ((v_event ->> 'kind' = 'event' AND wa.event_id::text = v_event ->> 'event_id')
            OR (v_event ->> 'kind' = 'round' AND wa.series_id::text = v_event ->> 'series_id' AND wa.round_name = v_event ->> 'round_name'))
        LIMIT 5) g;
      v_event := v_event || jsonb_build_object('going_initials', v_going);
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(x || jsonb_build_object('my_status', v_member -> 'answers' ->> (x ->> 'event_key')) ORDER BY x ->> 'event_date'), '[]'::jsonb)
  INTO v_week
  FROM jsonb_array_elements(v_events) x
  WHERE (x ->> 'event_date')::date BETWEEN v_today AND v_today + ((v_cfg ->> 'covers_days')::int - 1)
    AND public.whats_on_is_mine(x, v_member, v_cfg)
    AND x ->> 'event_key' IS DISTINCT FROM p_event_key;

  RETURN jsonb_build_object(
    'ok', true,
    'club', v_club - 'app_url',
    'app_url', v_club ->> 'app_url',
    'member', jsonb_build_object(
      'first_name', v_member ->> 'first_name', 'last_name', v_member ->> 'last_name',
      'email', v_member ->> 'email', 'activated', v_member -> 'activated', 'pending', v_member -> 'pending',
      'classes', (SELECT coalesce(jsonb_agg(DISTINCT b ->> 'class'), '[]'::jsonb) FROM jsonb_array_elements(v_member -> 'boats') b)),
    'event', v_event,
    'event_missing', p_event_key IS NOT NULL AND v_event IS NULL,
    'week', v_week,
    'rsvp', coalesce((v_cfg ->> 'show_rsvp')::boolean, true),
    'prefs', jsonb_build_object('enabled', v_member -> 'enabled', 'scope', v_member ->> 'scope'),
    'schedule', jsonb_build_object('enabled', v_cfg -> 'enabled', 'frequency', v_cfg ->> 'frequency',
                                   'send_day', v_cfg -> 'send_day', 'send_time', v_cfg ->> 'send_time'),
    'help', public.whats_on_help(t.club_id, v_cfg));
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
      UPDATE event_attendance SET status = p_status, updated_at = now() WHERE id = v_existing;
    ELSE
      INSERT INTO event_attendance (user_id, club_id, status, event_id, series_id, round_name)
      VALUES (v_user, t.club_id, p_status, v_ev, v_se, v_round);
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

CREATE OR REPLACE FUNCTION public.whats_on_set_prefs(p_token text, p_enabled boolean, p_scope text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM whats_on_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;
  INSERT INTO whats_on_member_prefs (member_id, club_id, whats_on_enabled, scope, updated_at)
  VALUES (t.member_id, t.club_id, coalesce(p_enabled, true),
          CASE WHEN p_scope IN ('classes', 'all') THEN p_scope ELSE 'classes' END, now())
  ON CONFLICT (member_id) DO UPDATE SET
    whats_on_enabled = coalesce(p_enabled, whats_on_member_prefs.whats_on_enabled),
    scope = CASE WHEN p_scope IN ('classes', 'all') THEN p_scope ELSE whats_on_member_prefs.scope END,
    updated_at = now();
  RETURN jsonb_build_object('ok', true, 'prefs',
    (SELECT jsonb_build_object('enabled', p.whats_on_enabled, 'scope', p.scope) FROM whats_on_member_prefs p WHERE p.member_id = t.member_id));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Activation: move email answers into event_attendance
-- ════════════════════════════════════════════════════════════════════════════
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
        VALUES (NEW.user_id, a.club_id, a.status, a.event_id, a.series_id, a.round_name);
      END IF;
    END LOOP;
    DELETE FROM whats_on_answers WHERE member_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whats_on_move_answers_on_link: member %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whats_on_move_answers_on_link ON public.members;
CREATE TRIGGER whats_on_move_answers_on_link
  AFTER UPDATE OF user_id ON public.members
  FOR EACH ROW
  WHEN (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.whats_on_move_answers_on_link();

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Permissions
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'whats_on_app_url()', 'whats_on_cfg(uuid, jsonb)', 'whats_on_club_info(uuid, jsonb)', 'whats_on_help(uuid, jsonb)',
    'whats_on_events(uuid, date, date)', 'whats_on_recipient_ids(uuid, jsonb)', 'whats_on_member_ctx(uuid)',
    'whats_on_member_token(uuid)', 'whats_on_send(uuid, text, text, uuid, jsonb, text, uuid)', 'whats_on_run_due()',
    'whats_on_move_answers_on_link()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'whats_on_settings_get(uuid)', 'whats_on_settings_save(uuid, jsonb)', 'whats_on_preview(uuid, jsonb, uuid, text)',
    'whats_on_audience(uuid, jsonb)', 'whats_on_send_test(uuid, jsonb, text)', 'whats_on_send_now(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'whats_on_page(text, text)', 'whats_on_answer(text, text, text)', 'whats_on_set_prefs(text, boolean, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;

GRANT SELECT ON public.whats_on_settings, public.whats_on_answers, public.whats_on_sends, public.whats_on_member_prefs TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Schedule: every hour at :05 (each club's own day, time and time zone decide)
-- ════════════════════════════════════════════════════════════════════════════
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'whats-on-emails';
SELECT cron.schedule('whats-on-emails', '5 * * * *', $$SELECT public.whats_on_run_due();$$);

-- Make the new functions visible to the API straight away
NOTIFY pgrst, 'reload schema';
