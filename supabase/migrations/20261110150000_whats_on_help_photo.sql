/*
  # What's On: the help contact's photo

  The help contact under the AlfiePRO panel shows the person's photo instead of their initials
  when they have one: the photo on their membership record, else their AlfiePRO profile photo.
  No photo: initials as before. whats_on_help adds 'avatar'; whats_on_render (the wrapper) swaps
  the initials circle for the photo.
*/
CREATE OR REPLACE FUNCTION public.whats_on_help(p_club uuid, p_cfg jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
  v_avatar text;
BEGIN
  IF NOT coalesce((p_cfg ->> 'help_enabled')::boolean, false) OR p_cfg ->> 'help_member_id' IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT mm.first_name, mm.last_name, mm.email, mm.phone, mm.user_id, to_jsonb(mm) ->> 'avatar_url' AS avatar_url INTO m
  FROM members mm
  WHERE mm.id = (p_cfg ->> 'help_member_id')::uuid AND mm.club_id::text = p_club::text;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Their photo: the membership record's, else their AlfiePRO profile's (public https images only)
  v_avatar := CASE WHEN coalesce(m.avatar_url, '') ~ '^https://' THEN m.avatar_url END;
  IF v_avatar IS NULL AND m.user_id IS NOT NULL THEN
    SELECT CASE WHEN coalesce(p.avatar_url, '') ~ '^https://' THEN p.avatar_url END INTO v_avatar
    FROM profiles p WHERE p.id = m.user_id;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'name', trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')),
    'first_name', m.first_name,
    'initials', public.whats_on_initials(m.first_name, m.last_name),
    'avatar', v_avatar,
    'title', nullif(trim(p_cfg ->> 'help_title'), ''),
    'phone', CASE WHEN coalesce((p_cfg ->> 'help_show_phone')::boolean, true) THEN nullif(trim(m.phone), '') END,
    'email', CASE WHEN coalesce((p_cfg ->> 'help_show_email')::boolean, true)
                  THEN coalesce(nullif(trim(p_cfg ->> 'help_email'), ''), nullif(trim(m.email), '')) END));
END;
$$;

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
  -- Help contact photo instead of initials (the purple circle stays behind it if images are blocked)
  IF coalesce(p_help ->> 'avatar', '') ~ '^https://' AND v_mail ->> 'html' IS NOT NULL THEN
    v_mail := jsonb_set(v_mail, '{html}', to_jsonb(regexp_replace(v_mail ->> 'html',
      '<div style="width:36px;height:36px;line-height:36px;border-radius:999px;background:#8A4DFF;[^"]*">[^<]*</div>',
      '<img src="' || public.whats_on_esc(p_help ->> 'avatar') || '" width="36" height="36" alt="' || public.whats_on_esc(p_help ->> 'initials')
        || '" style="display:block;width:36px;height:36px;border-radius:999px;object-fit:cover;border:0;background:#8A4DFF;color:#FFFFFF;font-size:12px;line-height:36px;text-align:center">')));
  END IF;
  BEGIN
    v_extra := public.whats_on_extras_html(p_club, p_cfg, p_member, p_from, p_preview);
  EXCEPTION WHEN OTHERS THEN
    -- The extra sections must never stop an email going out
    RAISE WARNING '[whats_on_render] extras skipped: %', SQLERRM;
    v_extra := '';
  END;
  -- No club racing for this member and a championship switch is on: say "No club racing"
  IF coalesce((v_mail ->> 'my_count')::int, 0) = 0 AND v_mail ->> 'html' IS NOT NULL
     AND (coalesce((p_cfg ->> 'show_state_events')::boolean, false) OR coalesce((p_cfg ->> 'show_national_events')::boolean, false)) THEN
    v_mail := jsonb_set(v_mail, '{html}', to_jsonb(replace(
      regexp_replace(v_mail ->> 'html', '(<div class="wo-h1"[^>]*>)[^<]*(</div>)', '\1No club racing ' || v_period || '\2'),
      'There&#39;s no racing on the calendar for your boats', 'There&#39;s no club racing on the calendar for your boats')));
  END IF;
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
    v_mail := v_mail || jsonb_build_object('club_count', 0, 'my_count', v_champs);
  END IF;
  RETURN v_mail || jsonb_build_object('html', v_html, 'championships', v_champs);
END;
$$;
