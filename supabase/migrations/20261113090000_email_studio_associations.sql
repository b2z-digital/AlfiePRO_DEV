-- Email studio for state and national associations.
-- An association's campaigns, segments, lists and templates use the existing state_association_id /
-- national_association_id columns. Everywhere the studio takes an organisation id (p_club), that id
-- may now be a club, a state association or a national association (ids never clash: all uuids).
-- An association's people are the members of its clubs (state: clubs in the state; national: clubs in
-- its states), one email each. Settings and unsubscribes are kept per organisation id.

-- 1. Settings and preferences are keyed by organisation id, not only club id
ALTER TABLE public.email_studio_settings DROP CONSTRAINT IF EXISTS email_studio_settings_club_id_fkey;
ALTER TABLE public.email_studio_prefs DROP CONSTRAINT IF EXISTS email_studio_prefs_club_id_fkey;

-- 2. What an organisation id is
CREATE OR REPLACE FUNCTION public.email_studio_org_kind(p_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM clubs WHERE id = p_org) THEN 'club'
    WHEN EXISTS (SELECT 1 FROM state_associations WHERE id = p_org) THEN 'state'
    WHEN EXISTS (SELECT 1 FROM national_associations WHERE id = p_org) THEN 'national'
  END
$$;

-- Clubs that belong to an organisation (a club is its own)
CREATE OR REPLACE FUNCTION public.email_studio_org_clubs(p_org uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM clubs c WHERE c.id = p_org
  UNION SELECT c.id FROM clubs c WHERE c.state_association_id = p_org
  UNION SELECT c.id FROM clubs c JOIN state_associations s ON s.id = c.state_association_id WHERE s.national_association_id = p_org
$$;

-- True when a row (club_id, state_association_id, national_association_id) belongs to the organisation
CREATE OR REPLACE FUNCTION public.email_studio_is_org(p_org uuid, p_club uuid, p_state uuid, p_national uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_org IS NOT NULL AND (p_club = p_org OR (p_club IS NULL AND (p_state = p_org OR (p_state IS NULL AND p_national = p_org))))
$$;

-- 3. Who can manage: a club id passed on its own may now be an association id
CREATE OR REPLACE FUNCTION public.email_studio_can_manage_org(p_club uuid, p_state uuid, p_national uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND coalesce(p.is_super_admin, false)) THEN
    RETURN true;
  END IF;
  IF p_club IS NOT NULL THEN
    v_kind := public.email_studio_org_kind(p_club);
    IF v_kind = 'state' THEN
      p_state := p_club;
    ELSIF v_kind = 'national' THEN
      p_national := p_club;
    ELSE
      RETURN EXISTS (SELECT 1 FROM user_clubs uc WHERE uc.club_id = p_club AND uc.user_id = auth.uid()
                     AND uc.role::text IN ('admin', 'super_admin', 'editor'));
    END IF;
  END IF;
  IF p_state IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM user_state_associations u WHERE u.state_association_id = p_state AND u.user_id = auth.uid()
                   AND u.role IN ('state_admin', 'admin', 'editor'));
  END IF;
  IF p_national IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM user_national_associations u WHERE u.national_association_id = p_national AND u.user_id = auth.uid()
                   AND u.role IN ('national_admin', 'admin', 'editor'));
  END IF;
  RETURN false;
END;
$$;

-- 4. People: members of the organisation's clubs
CREATE OR REPLACE FUNCTION public.email_studio_people(p_club uuid)
RETURNS TABLE (member_id uuid, email text, first_name text, last_name text, user_id uuid, status text, financial boolean,
               level text, renewal_date date, date_joined date, activated boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, lower(trim(m.email)), coalesce(nullif(trim(m.first_name), ''), ''), coalesce(trim(m.last_name), ''), m.user_id,
         coalesce(m.membership_status, 'active'), coalesce(m.is_financial, false),
         coalesce(nullif(trim(m.membership_level_custom), ''), nullif(trim(m.membership_level), '')),
         m.renewal_date, m.date_joined,
         m.user_id IS NOT NULL AND coalesce(m.activation_status, '') <> 'pending'
  FROM members m
  WHERE m.club_id IN (SELECT public.email_studio_org_clubs(p_club))
    AND m.archived_at IS NULL
    AND coalesce(m.membership_status, 'active') IN ('active', 'expired')
    AND coalesce(m.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

-- 5. Audience parts: segments, lists and campaigns of the organisation
CREATE OR REPLACE FUNCTION public.email_studio_part(p_club uuid, p_part jsonb)
RETURNS TABLE (member_id uuid, email text, first_name text, last_name text, user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text := p_part ->> 'kind';
  v_id uuid := CASE WHEN coalesce(p_part ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$' THEN (p_part ->> 'id')::uuid END;
  v_def jsonb;
BEGIN
  IF k = 'builtin' THEN
    v_def := public.email_studio_builtin_def(p_part ->> 'key');
  ELSIF k = 'segment' THEN
    SELECT l.filter_criteria INTO v_def FROM marketing_subscriber_lists l
    WHERE l.id = v_id AND public.email_studio_is_org(p_club, l.club_id, l.state_association_id, l.national_association_id) AND l.list_type = 'segment';
    IF v_def IS NULL THEN RETURN; END IF;
  ELSIF k = 'rules' THEN
    v_def := p_part -> 'def';
    IF jsonb_typeof(v_def) <> 'object' THEN RETURN; END IF;
  ELSIF k = 'list' THEN
    RETURN QUERY
      SELECT lm.member_id, lower(trim(lm.email)), coalesce(nullif(trim(lm.first_name), ''), ''), coalesce(trim(lm.last_name), ''), lm.user_id
      FROM marketing_list_members lm JOIN marketing_subscriber_lists l ON l.id = lm.list_id
      WHERE lm.list_id = v_id AND public.email_studio_is_org(p_club, l.club_id, l.state_association_id, l.national_association_id)
        AND coalesce(lm.status, 'active') = 'active'
        AND coalesce(lm.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    RETURN;
  ELSIF k IN ('not_opened', 'opened_not_clicked', 'clicked') THEN
    RETURN QUERY
      SELECT r.member_id, lower(trim(r.email)), coalesce(r.first_name, ''), coalesce(r.last_name, ''), r.user_id
      FROM marketing_recipients r JOIN marketing_campaigns c ON c.id = r.campaign_id
      WHERE r.campaign_id = v_id AND public.email_studio_is_org(p_club, c.club_id, c.state_association_id, c.national_association_id) AND r.status = 'sent'
        AND CASE k WHEN 'not_opened' THEN r.opened_at IS NULL
                   WHEN 'opened_not_clicked' THEN r.opened_at IS NOT NULL AND r.first_clicked_at IS NULL
                   ELSE r.first_clicked_at IS NOT NULL END;
    RETURN;
  ELSE
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.member_id, p.email, p.first_name, p.last_name, p.user_id
    FROM email_studio_people(p_club) p
    WHERE p.member_id IN (SELECT email_studio_segment_ids(p_club, v_def));
END;
$$;

-- 6. Home numbers for any organisation (people counted once per email)
CREATE OR REPLACE FUNCTION public.email_studio_home(p_club uuid, p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now jsonb;
  v_prev jsonb;
  v_recent jsonb;
  v_up jsonb;
  v_counts jsonb;
  v_wo jsonb;
BEGIN
  IF NOT public.email_studio_can_manage_org(p_club, NULL, NULL) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT jsonb_build_object(
           'sent', count(*) FILTER (WHERE r.status = 'sent'),
           'opened', count(*) FILTER (WHERE r.status = 'sent' AND r.opened_at IS NOT NULL),
           'clicked', count(*) FILTER (WHERE r.status = 'sent' AND r.first_clicked_at IS NOT NULL),
           'app', count(*) FILTER (WHERE r.status = 'sent' AND r.app_clicked))
  INTO v_now
  FROM marketing_recipients r
  WHERE r.club_id = p_club AND r.sent_at >= now() - make_interval(days => p_days);

  SELECT jsonb_build_object(
           'sent', count(*) FILTER (WHERE r.status = 'sent'),
           'opened', count(*) FILTER (WHERE r.status = 'sent' AND r.opened_at IS NOT NULL),
           'clicked', count(*) FILTER (WHERE r.status = 'sent' AND r.first_clicked_at IS NOT NULL))
  INTO v_prev
  FROM marketing_recipients r
  WHERE r.club_id = p_club AND r.sent_at >= now() - make_interval(days => p_days * 2) AND r.sent_at < now() - make_interval(days => p_days);

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'at' DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT jsonb_build_object('id', c.id, 'kind', 'campaign', 'name', c.name, 'subject', c.subject, 'at', c.sent_at,
             'topic', c.topic,
             'sent', (SELECT count(*) FROM marketing_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent'),
             'opened', (SELECT count(*) FROM marketing_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent' AND r.opened_at IS NOT NULL),
             'clicked', (SELECT count(*) FROM marketing_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent' AND r.first_clicked_at IS NOT NULL),
             'app', (SELECT count(*) FROM marketing_recipients r WHERE r.campaign_id = c.id AND r.status = 'sent' AND r.app_clicked)) AS x
    FROM marketing_campaigns c
    WHERE public.email_studio_is_org(p_club, c.club_id, c.state_association_id, c.national_association_id) AND c.studio AND c.status = 'sent'
    ORDER BY c.sent_at DESC NULLS LAST LIMIT 8) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'subject', c.subject, 'at', c.send_at, 'status', c.status) ORDER BY c.send_at), '[]'::jsonb)
  INTO v_up
  FROM marketing_campaigns c
  WHERE public.email_studio_is_org(p_club, c.club_id, c.state_association_id, c.national_association_id) AND c.studio AND c.status IN ('scheduled', 'sending');

  SELECT jsonb_build_object(
           'drafts', count(*) FILTER (WHERE c.status = 'draft'),
           'scheduled', count(*) FILTER (WHERE c.status IN ('scheduled', 'sending')),
           'sent', count(*) FILTER (WHERE c.status = 'sent'),
           'segments', (SELECT count(*) FROM marketing_subscriber_lists l WHERE public.email_studio_is_org(p_club, l.club_id, l.state_association_id, l.national_association_id) AND l.list_type = 'segment'),
           'lists', (SELECT count(*) FROM marketing_subscriber_lists l WHERE public.email_studio_is_org(p_club, l.club_id, l.state_association_id, l.national_association_id) AND l.list_type NOT IN ('segment', 'all_members')),
           'people', (SELECT count(DISTINCT p.email) FROM email_studio_people(p_club) p WHERE p.status = 'active'),
           'unsubscribed', (SELECT count(*) FROM email_studio_prefs pr WHERE pr.club_id = p_club AND pr.unsubscribed))
  INTO v_counts
  FROM marketing_campaigns c WHERE public.email_studio_is_org(p_club, c.club_id, c.state_association_id, c.national_association_id) AND c.studio;

  SELECT coalesce(jsonb_agg(jsonb_build_object('at', w.sent_at, 'recipients', w.recipients, 'kind', w.kind) ORDER BY w.sent_at DESC), '[]'::jsonb)
  INTO v_wo
  FROM (SELECT * FROM whats_on_sends w WHERE w.club_id = p_club AND w.kind <> 'test' ORDER BY w.sent_at DESC LIMIT 6) w;

  RETURN jsonb_build_object('now', v_now, 'prev', v_prev, 'recent', v_recent, 'upcoming', v_up, 'counts', v_counts, 'whats_on', v_wo);
END;
$$;

-- 7. Preferences page: an association campaign's recipients carry the association id in club_id
CREATE OR REPLACE FUNCTION public.email_studio_prefs_get(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_club uuid;
  v_pref record;
  v_wo boolean;
BEGIN
  SELECT rc.*, coalesce(c.club_id, c.state_association_id, c.national_association_id) AS c_club INTO r
  FROM marketing_recipients rc LEFT JOIN marketing_campaigns c ON c.id = rc.campaign_id
  WHERE rc.id = p_token;
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_club := coalesce(r.club_id, r.c_club);
  SELECT * INTO v_pref FROM email_studio_prefs WHERE club_id = v_club AND email = lower(trim(r.email));
  IF r.member_id IS NOT NULL THEN
    SELECT coalesce(whats_on_enabled, true) INTO v_wo FROM whats_on_member_prefs WHERE member_id = r.member_id;
  END IF;
  RETURN jsonb_build_object(
    'club', coalesce(
      (SELECT jsonb_build_object('name', cl.name, 'logo', cl.logo) FROM clubs cl WHERE cl.id = v_club),
      (SELECT jsonb_build_object('name', s.name, 'logo', s.logo_url) FROM state_associations s WHERE s.id = v_club),
      (SELECT jsonb_build_object('name', n.name, 'logo', n.logo_url) FROM national_associations n WHERE n.id = v_club)),
    'email', regexp_replace(lower(trim(r.email)), '^(.)[^@]*(@.*)$', '\1•••\2'),
    'first_name', r.first_name,
    'topics', public.email_studio_topics(v_club),
    'unsubscribed', coalesce(v_pref.unsubscribed, false),
    'topics_off', coalesce(to_jsonb(v_pref.topics_off), '[]'::jsonb),
    'is_member', r.member_id IS NOT NULL,
    'whats_on', CASE WHEN r.member_id IS NOT NULL AND public.email_studio_org_kind(v_club) = 'club' THEN coalesce(v_wo, true) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_prefs_set(p_token uuid, p_unsubscribed boolean, p_topics_off text[], p_whats_on boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_club uuid;
BEGIN
  SELECT rc.*, coalesce(c.club_id, c.state_association_id, c.national_association_id) AS c_club INTO r
  FROM marketing_recipients rc LEFT JOIN marketing_campaigns c ON c.id = rc.campaign_id
  WHERE rc.id = p_token;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Link not recognised';
  END IF;
  v_club := coalesce(r.club_id, r.c_club);
  INSERT INTO email_studio_prefs (club_id, email, member_id, unsubscribed, topics_off, updated_at)
  VALUES (v_club, lower(trim(r.email)), r.member_id, coalesce(p_unsubscribed, false),
          ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_topics_off, '{}')) x WHERE x ~ '^[a-z_]{1,32}$'), now())
  ON CONFLICT (club_id, email) DO UPDATE
    SET unsubscribed = EXCLUDED.unsubscribed, topics_off = EXCLUDED.topics_off,
        member_id = coalesce(EXCLUDED.member_id, email_studio_prefs.member_id), updated_at = now();
  IF coalesce(p_unsubscribed, false) AND r.unsubscribed_at IS NULL THEN
    UPDATE marketing_recipients SET unsubscribed_at = now() WHERE id = r.id;
    INSERT INTO marketing_events (recipient_id, campaign_id, event_type, event_data)
    VALUES (r.id, r.campaign_id, 'unsubscribe', jsonb_build_object('via', 'preferences'));
  END IF;
  -- What's On is a club email: only a club's own preferences page changes it
  IF p_whats_on IS NOT NULL AND r.member_id IS NOT NULL AND public.email_studio_org_kind(v_club) = 'club' THEN
    INSERT INTO whats_on_member_prefs (member_id, club_id, whats_on_enabled, updated_at)
    VALUES (r.member_id, v_club, p_whats_on, now())
    ON CONFLICT (member_id) DO UPDATE SET whats_on_enabled = EXCLUDED.whats_on_enabled, updated_at = now();
  END IF;
  RETURN public.email_studio_prefs_get(p_token);
END;
$$;

-- 8. Default topics wording for associations
CREATE OR REPLACE FUNCTION public.email_studio_topics(p_club uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT CASE WHEN jsonb_typeof(s.topics) = 'array' AND jsonb_array_length(s.topics) > 0 THEN s.topics END
     FROM email_studio_settings s WHERE s.club_id = p_club),
    CASE WHEN public.email_studio_org_kind(p_club) IN ('state', 'national') THEN '[
      {"key":"news","label":"Association news and announcements","note":"Updates and newsletters from the association"},
      {"key":"events","label":"Championships and events","note":"State and national events"},
      {"key":"results","label":"Results","note":"Championship results"}
    ]'::jsonb END,
    public.email_studio_default_topics())
$$;

-- 9. Permissions
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['email_studio_org_kind(uuid)', 'email_studio_org_clubs(uuid)', 'email_studio_is_org(uuid, uuid, uuid, uuid)',
                           'email_studio_people(uuid)', 'email_studio_part(uuid, jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['email_studio_can_manage_org(uuid, uuid, uuid)', 'email_studio_home(uuid, integer)', 'email_studio_topics(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['email_studio_prefs_get(uuid)', 'email_studio_prefs_set(uuid, boolean, text[], boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
