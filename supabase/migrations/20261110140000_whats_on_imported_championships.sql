/*
  # What's On championships: include the imported state / national calendar

  The dashboard's Upcoming Events and the race calendar also show events imported from the
  association website (external_events, from Events Scraping), e.g. "2026 NSW 10R State
  Championship". What's On only looked at events created in AlfiePRO (public_events), so those
  didn't appear. Now both are used:
  - State:    imported events filed under the club's state association (display_category 'state_<id>')
  - National: imported events filed under 'national' from the club's national association's source
  Only visible, active events. If the same event is in both (same day, level and class), it's listed once (the AlfiePRO one).
  Linked to the event page on the association website. Only whats_on_extras_html changes.
*/
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
  IF (v_state_ev AND v_state IS NOT NULL) OR v_nat_ev THEN
    FOR r IN
      SELECT DISTINCT ON (c.d, c.name_key) c.*
      FROM (
        -- State / national events created in AlfiePRO
        SELECT e.event_name, e.d, e.end_d, e.venue, e.race_class, e.event_level,
               CASE WHEN e.slug IS NOT NULL THEN v_app || '/events/' || e.slug
                    WHEN coalesce(e.notice_of_race_url, '') ~ '^https://' THEN e.notice_of_race_url END AS link,
               e.event_level || ':' || coalesce(public.whats_on_class_key(e.race_class), lower(regexp_replace(e.event_name, '[^A-Za-z0-9]', '', 'g'))) AS name_key,
               1 AS pref
        FROM (SELECT pe.*,
                     CASE WHEN pe.date ~ '^\d{4}-\d{2}-\d{2}' THEN left(pe.date, 10)::date END AS d,
                     CASE WHEN pe.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(pe.end_date, 10)::date END AS end_d,
                     (SELECT w.slug FROM event_websites w
                       WHERE w.event_id = pe.id AND coalesce(w.enabled, false)
                         AND (coalesce(w.website_published, false) OR w.status = 'published') AND coalesce(w.slug, '') <> ''
                       LIMIT 1) AS slug
              FROM public_events pe
              WHERE pe.approval_status = 'approved' AND NOT coalesce(pe.archived, false)) e
        WHERE (v_state_ev AND e.event_level = 'state' AND e.state_association_id = v_state)
           OR (v_nat_ev AND e.event_level = 'national' AND e.national_association_id = v_nat)
        UNION ALL
        -- State / national calendar imported from the association website (Events Scraping),
        -- the same events the dashboard's Upcoming Events and the race calendar show
        SELECT x.event_name, x.event_date, x.event_end_date, coalesce(nullif(x.venue, ''), x.location),
               coalesce(nullif(x.boat_class_mapped, ''), x.boat_class_raw),
               CASE WHEN x.display_category = 'national' THEN 'national' ELSE 'state' END,
               CASE WHEN coalesce(x.source_url, '') ~ '^https://' THEN x.source_url
                    WHEN coalesce(x.registration_url, '') ~ '^https://' THEN x.registration_url END,
               CASE WHEN x.display_category = 'national' THEN 'national' ELSE 'state' END || ':'
                 || coalesce(public.whats_on_class_key(coalesce(nullif(x.boat_class_mapped, ''), x.boat_class_raw)), lower(regexp_replace(x.event_name, '[^A-Za-z0-9]', '', 'g'))),
               2
        FROM external_events x
        LEFT JOIN external_event_sources s ON s.id = x.source_id
        WHERE x.is_visible AND x.event_status = 'active'
          AND (   (v_state_ev AND v_state IS NOT NULL AND x.display_category = 'state_' || v_state::text)
               OR (v_nat_ev AND x.display_category = 'national'
                   AND (s.target_national_association_id IS NULL OR s.target_national_association_id = v_nat)))
      ) c
      WHERE c.d BETWEEN p_from AND p_from + 120
        AND (   NOT v_by_class
             OR coalesce(trim(c.race_class), '') = ''
             OR EXISTS (SELECT 1 FROM regexp_split_to_table(c.race_class, '\s*[,/&;]\s*|\s+and\s+') part
                        WHERE public.whats_on_class_key(part) = ANY (coalesce(v_keys, ARRAY[]::text[]))))
      ORDER BY c.d, c.name_key, c.pref
      LIMIT 4
    LOOP
      v_url := CASE WHEN p_preview THEN '#' ELSE r.link END;
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
