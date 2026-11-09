/*
  # What's On: "No club racing this week" whenever a championship switch is on

  When a member has no club racing in the period and State or National championships is switched
  on, the heading says "No club racing this week" (and the empty note "no club racing"), whether or
  not a championship falls in the next four months. Only whats_on_render (the wrapper) changes.
*/
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
