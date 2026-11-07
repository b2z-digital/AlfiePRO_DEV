/*
  # What's On: no stray separator when a club has no address or a race has no venue

  The email footer showed "· info@club" when the club had no address, and "Also at the club"
  rows could start with "·" when a race had no venue. Replaces whats_on_render only.
  Nothing is sent by running this.
*/

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
  v_unanswered int := 0;
BEGIN
  v_all_audience := coalesce(p_cfg ->> 'audience', 'class') = 'all' OR coalesce(p_member ->> 'scope', 'classes') = 'all';

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_mine
  FROM jsonb_array_elements(coalesce(p_week, '[]'::jsonb)) x WHERE public.whats_on_is_mine(x, p_member, p_cfg);
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_other
  FROM jsonb_array_elements(coalesce(p_week, '[]'::jsonb)) x WHERE NOT public.whats_on_is_mine(x, p_member, p_cfg);
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'event_date', x ->> 'title'), '[]'::jsonb) INTO v_next_mine
  FROM jsonb_array_elements(coalesce(p_next, '[]'::jsonb)) x WHERE public.whats_on_is_mine(x, p_member, p_cfg);
  v_count := jsonb_array_length(v_mine);
  -- Races this member hasn't answered yet (in AlfiePRO, by SMS, by entering, or from an email)
  SELECT count(*) INTO v_unanswered FROM jsonb_array_elements(v_mine) x
  WHERE (p_member -> 'answers' ->> (x ->> 'event_key')) IS NULL;

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
    || CASE WHEN NOT coalesce((p_cfg ->> 'show_rsvp')::boolean, true) OR v_count = 0 THEN ''
            WHEN v_unanswered = 0 THEN ' You''ve already let us know for ' || CASE WHEN v_count = 1 THEN 'it' ELSE 'all of them' END || ', thanks.'
            WHEN v_unanswered < v_count THEN ' Tap Going or Can''t make it on the others so the PRO can plan the starts.'
            ELSE ' Tap Going or Can''t make it so the PRO can plan the starts.' END);

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
    || CASE WHEN v_unanswered > 0 AND coalesce((p_cfg ->> 'show_rsvp')::boolean, true) THEN ' · let the PRO know if you&#39;re coming' ELSE '' END;

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
             nullif(public.whats_on_esc(v_e ->> 'venue'), ''),
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
            THEN '<div>' || concat_ws(' · ', nullif(public.whats_on_esc(p_club ->> 'address'), ''),
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

NOTIFY pgrst, 'reload schema';
