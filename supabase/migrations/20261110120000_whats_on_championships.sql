/*
  # What's On: state and national championships

  New "What's in it" options for each club's What's On email (all off until the club turns them on):

  - show_state_events      State championships coming up (approved state events of the club's state association)
  - show_national_events   National championships coming up (approved national events of its national association)

  Championships: the next 120 days from the start of the email's period, up to 4. With the audience
  set to "members with a boat in the class", a member only sees championships for their classes
  (events with no class set are shown to everyone). Linked to the event website when it has one,
  otherwise the notice of race.

  How it's added: the current whats_on_render is renamed whats_on_render_base, unchanged, and a new
  whats_on_render with the same arguments calls it and adds the new sections at the end of the email
  body (after "Next week", before the AlfiePRO panel). Every caller (send, preview, test, view in
  browser) picks it up. whats_on_cfg and whats_on_settings_save learn the two new settings.

  A week with no club racing for a member but championships coming up says "No club racing this
  week" and still sends (it isn't a quiet week).
*/

-- ── 1. Settings ──────────────────────────────────────────────────────────────
ALTER TABLE public.whats_on_settings
  ADD COLUMN IF NOT EXISTS show_state_events    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_national_events boolean NOT NULL DEFAULT false;

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
    'subject', 'intro',
    'show_state_events', 'show_national_events'];
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
    'help_enabled', false, 'help_show_phone', true, 'help_show_email', true, 'saved', false,
    'show_state_events', false, 'show_national_events', false);

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
    help_show_email, help_email, brand_color, accent_color, subject, intro,
    show_state_events, show_national_events,
    updated_at, updated_by)
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
    left(nullif(trim(c ->> 'subject'), ''), 200), left(nullif(trim(c ->> 'intro'), ''), 1000),
    coalesce((c ->> 'show_state_events')::boolean, false), coalesce((c ->> 'show_national_events')::boolean, false),
    now(), auth.uid())
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
    subject = EXCLUDED.subject, intro = EXCLUDED.intro,
    show_state_events = EXCLUDED.show_state_events, show_national_events = EXCLUDED.show_national_events,
    updated_at = now(), updated_by = auth.uid(),
    -- Changing the send day or time re-arms this week's run
    last_run_key = CASE WHEN s.send_day IS DISTINCT FROM EXCLUDED.send_day OR s.send_time IS DISTINCT FROM EXCLUDED.send_time
                        THEN NULL ELSE s.last_run_key END;

  RETURN public.whats_on_settings_get(p_club);
END;
$$;

-- ── 2. The new sections ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.whats_on_extras_html(p_club jsonb, p_cfg jsonb, p_member jsonb, p_from date, p_preview boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid := (p_club ->> 'id')::uuid;
  v_app text := p_club ->> 'app_url';
  v_disp text := 'font-family:''Bricolage Grotesque'',-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.025em;';
  v_link text := 'color:#0A64D8;text-decoration:none;';
  v_state uuid;
  v_nat uuid;
  v_by_class boolean;
  v_keys text[];
  v_state_ev boolean := coalesce((p_cfg ->> 'show_state_events')::boolean, false);
  v_nat_ev boolean := coalesce((p_cfg ->> 'show_national_events')::boolean, false);
  v_out text := '';
  v_rows text := '';
  r record;
  v_url text;
  v_meta text;
  v_heading text;
BEGIN
  IF v_club IS NULL OR NOT (v_state_ev OR v_nat_ev) THEN
    RETURN '';
  END IF;

  SELECT c.state_association_id INTO v_state FROM clubs c WHERE c.id = v_club;
  IF v_state IS NOT NULL THEN
    SELECT sa.national_association_id INTO v_nat FROM state_associations sa WHERE sa.id = v_state;
  END IF;

  -- Championships for this member's classes (unless the club sends everything to everyone)
  v_by_class := coalesce(p_cfg ->> 'audience', 'class') = 'class' AND coalesce(p_member ->> 'scope', 'classes') <> 'all';
  SELECT array_agg(DISTINCT b ->> 'key') INTO v_keys
  FROM jsonb_array_elements(coalesce(p_member -> 'boats', '[]'::jsonb)) b WHERE b ->> 'key' IS NOT NULL;

  -- ── Championships coming up ──
  IF (v_state_ev AND v_state IS NOT NULL) OR (v_nat_ev AND v_nat IS NOT NULL) THEN
    FOR r IN
      SELECT e.id, e.event_name, e.d, e.end_d, e.venue, e.race_class, e.event_level,
             e.notice_of_race_url,
             (SELECT w.slug FROM event_websites w
               WHERE w.event_id = e.id AND coalesce(w.enabled, false)
                 AND (coalesce(w.website_published, false) OR w.status = 'published') AND coalesce(w.slug, '') <> ''
               LIMIT 1) AS slug
      FROM (SELECT pe.*,
                   CASE WHEN pe.date ~ '^\d{4}-\d{2}-\d{2}' THEN left(pe.date, 10)::date END AS d,
                   CASE WHEN pe.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(pe.end_date, 10)::date END AS end_d
            FROM public_events pe
            WHERE pe.approval_status = 'approved' AND NOT coalesce(pe.archived, false)) e
      WHERE e.d BETWEEN p_from AND p_from + 120
        AND (   (v_state_ev AND e.event_level = 'state' AND e.state_association_id = v_state)
             OR (v_nat_ev AND e.event_level = 'national' AND e.national_association_id = v_nat))
        AND (   NOT v_by_class
             OR coalesce(trim(e.race_class), '') = ''
             OR EXISTS (SELECT 1 FROM regexp_split_to_table(e.race_class, '\s*[,/&;]\s*|\s+and\s+') part
                        WHERE public.whats_on_class_key(part) = ANY (coalesce(v_keys, ARRAY[]::text[]))))
      ORDER BY e.d, e.event_name
      LIMIT 4
    LOOP
      v_url := CASE
        WHEN p_preview THEN '#'
        WHEN r.slug IS NOT NULL THEN v_app || '/events/' || r.slug
        WHEN coalesce(r.notice_of_race_url, '') ~ '^https://' THEN r.notice_of_race_url
        END;
      v_meta := nullif(concat_ws(' · ',
        public.whats_on_esc(nullif(trim(r.race_class), '')),
        public.whats_on_esc(nullif(trim(r.venue), '')),
        CASE WHEN r.end_d > r.d THEN 'until ' || to_char(r.end_d, 'Dy FMDD Mon') END), '');
      v_rows := v_rows
        || '<table data-wo="champ" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #EEF2F7"><tr>'
        || '<td valign="top" width="44" style="width:44px;padding:12px 0 12px 2px;font-size:12px;font-weight:600;color:#64748B;line-height:1.3">' || upper(to_char(r.d, 'Mon'))
        || '<br><span style="' || v_disp || 'font-size:18px;color:#0B1220">' || to_char(r.d, 'FMDD') || '</span></td>'
        || '<td valign="top" style="padding:12px 0 12px 12px">'
        || '<div style="font-size:14px;font-weight:600;color:#0B1220">'
        || '<span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;margin-right:6px;vertical-align:1px;'
        || CASE WHEN r.event_level = 'national' THEN 'background:#FFF1E6;color:#B4530A' ELSE 'background:#EEE8FF;color:#5B2FD6' END || '">'
        || CASE WHEN r.event_level = 'national' THEN 'National' ELSE 'State' END || '</span>'
        || CASE WHEN v_url IS NOT NULL THEN '<a href="' || public.whats_on_esc(v_url) || '" style="color:#0B1220;text-decoration:none">' || public.whats_on_esc(r.event_name) || '</a>'
                ELSE public.whats_on_esc(r.event_name) END
        || '</div>'
        || coalesce('<div style="font-size:12.5px;color:#64748B;margin-top:2px">' || v_meta || '</div>', '')
        || '</td></tr></table>';
    END LOOP;

    IF v_rows <> '' THEN
      v_heading := CASE WHEN v_state_ev AND v_nat_ev THEN 'State and national championships'
                        WHEN v_nat_ev THEN 'National championships' ELSE 'State championships' END;
      v_out := v_out || '<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>'
        || '<div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748B;margin:6px 2px 2px">'
        || v_heading || ' coming up</div>' || v_rows;
    END IF;
  END IF;

  RETURN v_out;
END;
$$;

-- ── 3. Wrap the renderer ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'whats_on_render_base' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.whats_on_render(jsonb, jsonb, jsonb, jsonb, jsonb, date, date, text, boolean, jsonb)
      RENAME TO whats_on_render_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.whats_on_render(
  p_club jsonb, p_cfg jsonb, p_member jsonb, p_week jsonb, p_next jsonb,
  p_from date, p_to date, p_token text, p_preview boolean, p_help jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_mail jsonb;
  v_html text;
  v_extra text;
  v_panel_row text := '<tr><td class="wo-pad" style="padding:20px 36px 28px">';
  v_gap_row text := '<tr><td style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>';
  v_marker text;
  v_champs int;
  v_period text := CASE WHEN (p_cfg ->> 'covers_days')::int = 14 THEN 'in the next two weeks' ELSE 'this week' END;
BEGIN
  v_mail := public.whats_on_render_base(p_club, p_cfg, p_member, p_week, p_next, p_from, p_to, p_token, p_preview, p_help);
  BEGIN
    v_extra := public.whats_on_extras_html(p_club, p_cfg, p_member, p_from, p_preview);
  EXCEPTION WHEN OTHERS THEN
    -- The extra sections must never stop an email going out
    RAISE WARNING '[whats_on_render] extras skipped: %', SQLERRM;
    v_extra := '';
  END;
  IF coalesce(v_extra, '') = '' THEN
    RETURN v_mail;
  END IF;

  v_html := v_mail ->> 'html';
  -- The body cell closes just before the AlfiePRO panel row (or the spacer row when the panel is off)
  v_marker := CASE WHEN position('</td></tr>' || v_panel_row IN v_html) > 0 THEN '</td></tr>' || v_panel_row
                   WHEN position('</td></tr>' || v_gap_row IN v_html) > 0 THEN '</td></tr>' || v_gap_row END;
  IF v_marker IS NULL THEN
    RETURN v_mail;
  END IF;
  v_html := overlay(v_html PLACING v_extra || v_marker FROM position(v_marker IN v_html) FOR length(v_marker));
  v_champs := (length(v_extra) - length(replace(v_extra, 'data-wo="champ"', ''))) / length('data-wo="champ"');

  -- No club racing for this member, but championships are coming up: say "No club racing",
  -- and count the championships so a quiet week still sends (my_count drives "skip quiet weeks")
  IF coalesce((v_mail ->> 'my_count')::int, 0) = 0 AND v_champs > 0 THEN
    v_html := regexp_replace(v_html, '(<div class="wo-h1"[^>]*>)[^<]*(</div>)', '\1No club racing ' || v_period || '\2');
    v_html := replace(v_html, 'There&#39;s no racing on the calendar for your boats', 'There&#39;s no club racing on the calendar for your boats');
    v_mail := v_mail || jsonb_build_object('club_count', 0, 'my_count', v_champs);
  END IF;
  RETURN v_mail || jsonb_build_object('html', v_html, 'championships', v_champs);
END;
$$;
