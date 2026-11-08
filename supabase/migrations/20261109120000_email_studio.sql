-- Email studio (Communications › Email studio): campaigns built from blocks, audiences, tracking and member preferences.
-- Builds on the existing marketing_* tables. What's On and the membership emails are untouched.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Who can manage an organisation's email
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_studio_can_manage_org(p_club uuid, p_state uuid, p_national uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND coalesce(p.is_super_admin, false)) THEN
    RETURN true;
  END IF;
  IF p_club IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM user_clubs uc WHERE uc.club_id = p_club AND uc.user_id = auth.uid()
                   AND uc.role::text IN ('admin', 'super_admin', 'editor'));
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Tables and columns
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.email_studio_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  from_name text,
  reply_to text,
  footer_address text,
  use_website_brand boolean NOT NULL DEFAULT true,
  brand jsonb,
  topics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.email_studio_prefs (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  email text NOT NULL,
  member_id uuid,
  unsubscribed boolean NOT NULL DEFAULT false,
  topics_off text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, email)
);

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS audience jsonb,
  ADD COLUMN IF NOT EXISTS test_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS studio boolean NOT NULL DEFAULT false;

ALTER TABLE public.marketing_recipients
  ADD COLUMN IF NOT EXISTS club_id uuid,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_clicked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS marketing_recipients_campaign_idx ON public.marketing_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS marketing_recipients_club_sent_idx ON public.marketing_recipients (club_id, sent_at);
CREATE INDEX IF NOT EXISTS marketing_recipients_email_idx ON public.marketing_recipients (club_id, lower(email));
CREATE INDEX IF NOT EXISTS marketing_events_campaign_idx ON public.marketing_events (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS marketing_events_recipient_idx ON public.marketing_events (recipient_id);
CREATE INDEX IF NOT EXISTS marketing_campaigns_club_idx ON public.marketing_campaigns (club_id, status, send_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Row level security
-- Campaigns, their content, recipients and tracking were readable by any signed-in user.
-- Now only the people who manage that club or association can see or change them.
-- (Lists stay as they are: Conversations uses them.)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.email_studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_studio_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read email settings" ON public.email_studio_settings;
CREATE POLICY "Managers read email settings" ON public.email_studio_settings FOR SELECT TO authenticated
  USING (public.email_studio_can_manage_org(club_id, NULL, NULL));
DROP POLICY IF EXISTS "Managers write email settings" ON public.email_studio_settings;
CREATE POLICY "Managers write email settings" ON public.email_studio_settings FOR ALL TO authenticated
  USING (public.email_studio_can_manage_org(club_id, NULL, NULL))
  WITH CHECK (public.email_studio_can_manage_org(club_id, NULL, NULL));

DROP POLICY IF EXISTS "Managers read email prefs" ON public.email_studio_prefs;
CREATE POLICY "Managers read email prefs" ON public.email_studio_prefs FOR SELECT TO authenticated
  USING (public.email_studio_can_manage_org(club_id, NULL, NULL));

DROP POLICY IF EXISTS "Auth view campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Auth insert campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Auth update campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Auth delete campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Managers manage campaigns" ON public.marketing_campaigns;
CREATE POLICY "Managers manage campaigns" ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.email_studio_can_manage_org(club_id, state_association_id, national_association_id))
  WITH CHECK (public.email_studio_can_manage_org(club_id, state_association_id, national_association_id));

DROP POLICY IF EXISTS "Auth view content" ON public.marketing_campaign_content;
DROP POLICY IF EXISTS "Auth insert content" ON public.marketing_campaign_content;
DROP POLICY IF EXISTS "Auth update content" ON public.marketing_campaign_content;
DROP POLICY IF EXISTS "Auth delete content" ON public.marketing_campaign_content;
DROP POLICY IF EXISTS "Managers manage content" ON public.marketing_campaign_content;
CREATE POLICY "Managers manage content" ON public.marketing_campaign_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM marketing_campaigns c WHERE c.id = campaign_id
                 AND public.email_studio_can_manage_org(c.club_id, c.state_association_id, c.national_association_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM marketing_campaigns c WHERE c.id = campaign_id
                 AND public.email_studio_can_manage_org(c.club_id, c.state_association_id, c.national_association_id)));

DROP POLICY IF EXISTS "Auth manage recipients" ON public.marketing_recipients;
DROP POLICY IF EXISTS "Auth view recipients" ON public.marketing_recipients;
DROP POLICY IF EXISTS "Managers view recipients" ON public.marketing_recipients;
CREATE POLICY "Managers view recipients" ON public.marketing_recipients FOR SELECT TO authenticated
  USING (
    (club_id IS NOT NULL AND public.email_studio_can_manage_org(club_id, NULL, NULL))
    OR EXISTS (SELECT 1 FROM marketing_campaigns c WHERE c.id = campaign_id
               AND public.email_studio_can_manage_org(c.club_id, c.state_association_id, c.national_association_id))
    OR EXISTS (SELECT 1 FROM marketing_flow_steps s JOIN marketing_automation_flows f ON f.id = s.flow_id
               WHERE s.id = flow_step_id AND public.email_studio_can_manage_org(f.club_id, f.state_association_id, f.national_association_id)));

DROP POLICY IF EXISTS "Auth view events" ON public.marketing_events;
DROP POLICY IF EXISTS "Auth insert events" ON public.marketing_events;
DROP POLICY IF EXISTS "Managers view events" ON public.marketing_events;
CREATE POLICY "Managers view events" ON public.marketing_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM marketing_campaigns c WHERE c.id = campaign_id
                 AND public.email_studio_can_manage_org(c.club_id, c.state_association_id, c.national_association_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_studio_settings TO authenticated;
GRANT SELECT ON public.email_studio_prefs TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Topics members can switch off
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_studio_default_topics()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '[
    {"key":"news","label":"Club news and announcements","note":"Updates and newsletters from the club"},
    {"key":"results","label":"Results","note":"Results after race days"},
    {"key":"events","label":"Events and regattas","note":"Entries opening and event details"},
    {"key":"classifieds","label":"Classifieds","note":"Boats and gear for sale"},
    {"key":"association","label":"State and national news","note":"News passed on from associations"}
  ]'::jsonb
$$;

CREATE OR REPLACE FUNCTION public.email_studio_topics(p_club uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT CASE WHEN jsonb_typeof(s.topics) = 'array' AND jsonb_array_length(s.topics) > 0 THEN s.topics END
                   FROM email_studio_settings s WHERE s.club_id = p_club), public.email_studio_default_topics())
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Audiences
-- People: club members (not archived) with a usable email address.
-- Built-in groups, saved segments (marketing_subscriber_lists, list_type 'segment') and lists.
-- ════════════════════════════════════════════════════════════════════════════
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
  WHERE m.club_id = p_club
    AND m.archived_at IS NULL
    AND coalesce(m.membership_status, 'active') IN ('active', 'expired')
    AND coalesce(m.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

CREATE OR REPLACE FUNCTION public.email_studio_rule_ids(p_club uuid, p_rule jsonb)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f text := p_rule ->> 'field';
  op text := coalesce(p_rule ->> 'op', '');
  v jsonb := p_rule -> 'value';
  n int := CASE WHEN jsonb_typeof(p_rule -> 'value') = 'number' THEN (p_rule ->> 'value')::int ELSE NULL END;
  arr text[] := CASE WHEN jsonb_typeof(p_rule -> 'value') = 'array'
                     THEN ARRAY(SELECT lower(x) FROM jsonb_array_elements_text(p_rule -> 'value') x) ELSE NULL END;
  yes boolean := CASE WHEN jsonb_typeof(p_rule -> 'value') = 'boolean' THEN (p_rule ->> 'value')::boolean ELSE NULL END;
BEGIN
  IF f = 'status' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.status = ANY(coalesce(arr, ARRAY['active']));
  ELSIF f = 'financial' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.financial = coalesce(yes, true);
  ELSIF f = 'level' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE lower(coalesce(p.level, '')) = ANY(coalesce(arr, '{}'));
  ELSIF f = 'renews' THEN
    IF op = 'overdue' THEN
      RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.renewal_date < current_date;
    ELSE
      RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p
        WHERE p.renewal_date BETWEEN current_date AND current_date + coalesce(n, 30);
    END IF;
  ELSIF f = 'joined' THEN
    IF op = 'before' THEN
      RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.date_joined < current_date - coalesce(n, 365);
    ELSE
      RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.date_joined >= current_date - coalesce(n, 365);
    END IF;
  ELSIF f = 'boat_class' THEN
    RETURN QUERY SELECT DISTINCT p.member_id FROM email_studio_people(p_club) p
      JOIN member_boats b ON b.member_id = p.member_id
      WHERE lower(trim(coalesce(b.boat_type, ''))) = ANY(coalesce(arr, '{}'));
  ELSIF f = 'has_boat' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p
      WHERE EXISTS (SELECT 1 FROM member_boats b WHERE b.member_id = p.member_id) = coalesce(yes, true);
  ELSIF f = 'signed_in' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.activated = coalesce(yes, true);
  ELSIF f IN ('opened', 'clicked') THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p
      WHERE EXISTS (SELECT 1 FROM marketing_recipients r
                    WHERE r.club_id = p_club AND lower(r.email) = p.email
                      AND CASE WHEN f = 'opened' THEN r.opened_at ELSE r.first_clicked_at END >= now() - make_interval(days => coalesce(n, 90)))
            = (op <> 'not_within');
  ELSIF f = 'going' THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p
      WHERE EXISTS (SELECT 1 FROM event_attendance ea WHERE p.user_id IS NOT NULL AND ea.user_id = p.user_id AND ea.status::text = 'yes'
                      AND ea.created_at >= now() - make_interval(days => coalesce(n, 90)))
         OR EXISTS (SELECT 1 FROM whats_on_answers wa WHERE wa.member_id = p.member_id AND wa.status = 'yes'
                      AND wa.created_at >= now() - make_interval(days => coalesce(n, 90)));
  END IF;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_segment_ids(p_club uuid, p_def jsonb)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb;
  v_any boolean := coalesce(p_def ->> 'match', 'all') = 'any';
  v_ids uuid[];
  v_rule uuid[];
  v_first boolean := true;
BEGIN
  IF jsonb_typeof(p_def -> 'rules') <> 'array' OR jsonb_array_length(p_def -> 'rules') = 0 THEN
    RETURN QUERY SELECT p.member_id FROM email_studio_people(p_club) p WHERE p.status = 'active';
    RETURN;
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_def -> 'rules') LOOP
    v_rule := ARRAY(SELECT email_studio_rule_ids(p_club, r));
    IF v_first THEN
      v_ids := v_rule;
      v_first := false;
    ELSIF v_any THEN
      v_ids := ARRAY(SELECT unnest(v_ids) UNION SELECT unnest(v_rule));
    ELSE
      v_ids := ARRAY(SELECT unnest(v_ids) INTERSECT SELECT unnest(v_rule));
    END IF;
  END LOOP;
  RETURN QUERY SELECT DISTINCT unnest(coalesce(v_ids, '{}'));
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_builtin_def(p_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'all'          THEN '{"rules":[{"field":"status","value":["active"]}]}'
    WHEN 'everyone'     THEN '{"rules":[{"field":"status","value":["active","expired"]}]}'
    WHEN 'financial'    THEN '{"rules":[{"field":"status","value":["active"]},{"field":"financial","value":true}]}'
    WHEN 'lapsed'       THEN '{"rules":[{"field":"status","value":["expired"]}]}'
    WHEN 'new'          THEN '{"rules":[{"field":"status","value":["active"]},{"field":"joined","op":"within","value":365}]}'
    WHEN 'renewing'     THEN '{"rules":[{"field":"status","value":["active"]},{"field":"renews","op":"within","value":30}]}'
    WHEN 'signed_in'    THEN '{"rules":[{"field":"status","value":["active"]},{"field":"signed_in","value":true}]}'
    WHEN 'not_signed_in' THEN '{"rules":[{"field":"status","value":["active"]},{"field":"signed_in","value":false}]}'
    WHEN 'quiet'        THEN '{"rules":[{"field":"status","value":["active"]},{"field":"opened","op":"not_within","value":90}]}'
    ELSE '{"rules":[{"field":"status","value":["active"]}]}' END::jsonb
$$;

-- One audience part ({kind, id|key}) as people: (member_id, email, first, last, user_id)
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
    WHERE l.id = v_id AND l.club_id = p_club AND l.list_type = 'segment';
    IF v_def IS NULL THEN RETURN; END IF;
  ELSIF k = 'rules' THEN
    -- An unsaved segment (the segment builder's live count)
    v_def := p_part -> 'def';
    IF jsonb_typeof(v_def) <> 'object' THEN RETURN; END IF;
  ELSIF k = 'list' THEN
    RETURN QUERY
      SELECT lm.member_id, lower(trim(lm.email)), coalesce(nullif(trim(lm.first_name), ''), ''), coalesce(trim(lm.last_name), ''), lm.user_id
      FROM marketing_list_members lm JOIN marketing_subscriber_lists l ON l.id = lm.list_id
      WHERE lm.list_id = v_id AND l.club_id = p_club AND coalesce(lm.status, 'active') = 'active'
        AND coalesce(lm.email, '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    RETURN;
  ELSIF k IN ('not_opened', 'opened_not_clicked', 'clicked') THEN
    RETURN QUERY
      SELECT r.member_id, lower(trim(r.email)), coalesce(r.first_name, ''), coalesce(r.last_name, ''), r.user_id
      FROM marketing_recipients r JOIN marketing_campaigns c ON c.id = r.campaign_id
      WHERE r.campaign_id = v_id AND c.club_id = p_club AND r.status = 'sent'
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

-- Everyone an audience reaches, after leaving people out and respecting their preferences.
CREATE OR REPLACE FUNCTION public.email_studio_recipients(p_club uuid, p_aud jsonb, p_topic text DEFAULT NULL)
RETURNS TABLE (member_id uuid, email text, first_name text, last_name text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inc AS (
    SELECT x.member_id, x.email, x.first_name, x.last_name, x.user_id, part.i
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aud -> 'include') = 'array' THEN p_aud -> 'include' ELSE '[]'::jsonb END)
         WITH ORDINALITY AS part(p, i)
    CROSS JOIN LATERAL public.email_studio_part(p_club, part.p) x
  ), exc AS (
    SELECT x.email
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aud -> 'exclude') = 'array' THEN p_aud -> 'exclude' ELSE '[]'::jsonb END) AS part(p)
    CROSS JOIN LATERAL public.email_studio_part(p_club, part.p) x
  )
  SELECT DISTINCT ON (inc.email) inc.member_id, inc.email, inc.first_name, inc.last_name, inc.user_id
  FROM inc
  WHERE NOT EXISTS (SELECT 1 FROM exc WHERE exc.email = inc.email)
    AND NOT EXISTS (SELECT 1 FROM email_studio_prefs pr WHERE pr.club_id = p_club AND pr.email = inc.email
                    AND (pr.unsubscribed OR (p_topic IS NOT NULL AND p_topic <> 'important' AND p_topic = ANY(pr.topics_off))))
    AND NOT EXISTS (SELECT 1 FROM marketing_preferences mp WHERE lower(mp.email) = inc.email AND coalesce(mp.unsubscribed_all, false))
  ORDER BY inc.email, (inc.member_id IS NULL), inc.i
$$;

-- For the composer and segment builder: how many people, and a few names.
CREATE OR REPLACE FUNCTION public.email_studio_audience_count(p_club uuid, p_aud jsonb, p_topic text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  v_before int;
BEGIN
  IF NOT public.email_studio_can_manage_org(p_club, NULL, NULL) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  WITH r AS (SELECT * FROM public.email_studio_recipients(p_club, p_aud, p_topic))
  SELECT jsonb_build_object(
           'count', (SELECT count(*) FROM r),
           'members', (SELECT count(*) FROM r WHERE r.member_id IS NOT NULL),
           'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', trim(s.first_name || ' ' || s.last_name), 'member_id', s.member_id)), '[]'::jsonb)
                      FROM (SELECT * FROM r WHERE r.first_name <> '' ORDER BY md5(r.email || current_date::text) LIMIT 5) s))
  INTO v;
  SELECT count(*) INTO v_before FROM public.email_studio_recipients(p_club, jsonb_build_object('include', p_aud -> 'include'), NULL);
  RETURN v || jsonb_build_object('others', (v ->> 'count')::int - (v ->> 'members')::int,
                                 'left_out', greatest(v_before - (v ->> 'count')::int, 0));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Home and report numbers
-- ════════════════════════════════════════════════════════════════════════════
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
    WHERE c.club_id = p_club AND c.studio AND c.status = 'sent'
    ORDER BY c.sent_at DESC NULLS LAST LIMIT 8) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'subject', c.subject, 'at', c.send_at, 'status', c.status) ORDER BY c.send_at), '[]'::jsonb)
  INTO v_up
  FROM marketing_campaigns c
  WHERE c.club_id = p_club AND c.studio AND c.status IN ('scheduled', 'sending');

  SELECT jsonb_build_object(
           'drafts', count(*) FILTER (WHERE c.status = 'draft'),
           'scheduled', count(*) FILTER (WHERE c.status IN ('scheduled', 'sending')),
           'sent', count(*) FILTER (WHERE c.status = 'sent'),
           'segments', (SELECT count(*) FROM marketing_subscriber_lists l WHERE l.club_id = p_club AND l.list_type = 'segment'),
           'lists', (SELECT count(*) FROM marketing_subscriber_lists l WHERE l.club_id = p_club AND l.list_type NOT IN ('segment', 'all_members')),
           'people', (SELECT count(*) FROM email_studio_people(p_club) p WHERE p.status = 'active'),
           'unsubscribed', (SELECT count(*) FROM email_studio_prefs pr WHERE pr.club_id = p_club AND pr.unsubscribed))
  INTO v_counts
  FROM marketing_campaigns c WHERE c.club_id = p_club AND c.studio;

  SELECT coalesce(jsonb_agg(jsonb_build_object('at', w.sent_at, 'recipients', w.recipients, 'kind', w.kind) ORDER BY w.sent_at DESC), '[]'::jsonb)
  INTO v_wo
  FROM (SELECT * FROM whats_on_sends w WHERE w.club_id = p_club AND w.kind <> 'test' ORDER BY w.sent_at DESC LIMIT 6) w;

  RETURN jsonb_build_object('now', v_now, 'prev', v_prev, 'recent', v_recent, 'upcoming', v_up, 'counts', v_counts, 'whats_on', v_wo);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_report(p_campaign uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  v_tot jsonb;
  v_hours jsonb;
  v_links jsonb;
  v_blocks jsonb;
BEGIN
  SELECT * INTO c FROM marketing_campaigns WHERE id = p_campaign;
  IF c.id IS NULL OR NOT public.email_studio_can_manage_org(c.club_id, c.state_association_id, c.national_association_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT jsonb_build_object(
           'recipients', count(*),
           'sent', count(*) FILTER (WHERE r.status = 'sent'),
           'failed', count(*) FILTER (WHERE r.status = 'failed'),
           'queued', count(*) FILTER (WHERE r.status IN ('queued', 'sending')),
           'opened', count(*) FILTER (WHERE r.opened_at IS NOT NULL),
           'clicked', count(*) FILTER (WHERE r.first_clicked_at IS NOT NULL),
           'app', count(*) FILTER (WHERE r.app_clicked),
           'unsubscribed', count(*) FILTER (WHERE r.unsubscribed_at IS NOT NULL),
           'not_opened', count(*) FILTER (WHERE r.status = 'sent' AND r.opened_at IS NULL),
           'opened_not_clicked', count(*) FILTER (WHERE r.opened_at IS NOT NULL AND r.first_clicked_at IS NULL),
           'clicks', coalesce(sum(r.click_count), 0))
  INTO v_tot
  FROM marketing_recipients r WHERE r.campaign_id = p_campaign;

  SELECT coalesce(jsonb_agg(jsonb_build_object('h', h, 'n', n) ORDER BY h), '[]'::jsonb) INTO v_hours FROM (
    SELECT floor(extract(epoch FROM (r.opened_at - coalesce(c.sent_at, c.sending_started_at, r.sent_at))) / 3600)::int AS h, count(*) AS n
    FROM marketing_recipients r
    WHERE r.campaign_id = p_campaign AND r.opened_at IS NOT NULL
    GROUP BY 1) q WHERE h BETWEEN 0 AND 47;

  SELECT coalesce(jsonb_agg(jsonb_build_object('url', url, 'block', blk, 'clicks', clicks, 'people', people) ORDER BY clicks DESC), '[]'::jsonb)
  INTO v_links FROM (
    SELECT e.event_data ->> 'url' AS url, e.event_data ->> 'block' AS blk, count(*) AS clicks, count(DISTINCT e.recipient_id) AS people
    FROM marketing_events e WHERE e.campaign_id = p_campaign AND e.event_type = 'click'
    GROUP BY 1, 2) q;

  SELECT coalesce(jsonb_object_agg(blk, clicks), '{}'::jsonb) INTO v_blocks FROM (
    SELECT e.event_data ->> 'block' AS blk, count(*) AS clicks
    FROM marketing_events e WHERE e.campaign_id = p_campaign AND e.event_type = 'click' AND e.event_data ->> 'block' IS NOT NULL
    GROUP BY 1) q;

  RETURN jsonb_build_object('totals', v_tot, 'hours', v_hours, 'links', v_links, 'blocks', v_blocks);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_member_activity(p_club uuid, p_email text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_pref jsonb;
BEGIN
  IF NOT public.email_studio_can_manage_org(p_club, NULL, NULL) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('campaign', c.name, 'subject', c.subject, 'campaign_id', c.id, 'sent_at', r.sent_at,
           'opened_at', r.opened_at, 'clicked_at', r.first_clicked_at, 'status', r.status) ORDER BY r.sent_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows
  FROM (SELECT * FROM marketing_recipients r WHERE r.club_id = p_club AND lower(r.email) = lower(trim(p_email))
        ORDER BY r.sent_at DESC NULLS LAST LIMIT 20) r
  LEFT JOIN marketing_campaigns c ON c.id = r.campaign_id;
  SELECT to_jsonb(pr) INTO v_pref FROM email_studio_prefs pr WHERE pr.club_id = p_club AND pr.email = lower(trim(p_email));
  RETURN jsonb_build_object('emails', v_rows, 'prefs', v_pref, 'topics', public.email_studio_topics(p_club));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Member preferences page (link in every email; token = the recipient row)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_studio_prefs_get(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_club uuid;
  v_pref record;
  v_wo boolean;
BEGIN
  SELECT rc.*, c.club_id AS c_club INTO r
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
    'club', (SELECT jsonb_build_object('name', cl.name, 'logo', cl.logo) FROM clubs cl WHERE cl.id = v_club),
    'email', regexp_replace(lower(trim(r.email)), '^(.)[^@]*(@.*)$', '\1•••\2'),
    'first_name', r.first_name,
    'topics', public.email_studio_topics(v_club),
    'unsubscribed', coalesce(v_pref.unsubscribed, false),
    'topics_off', coalesce(to_jsonb(v_pref.topics_off), '[]'::jsonb),
    'is_member', r.member_id IS NOT NULL,
    'whats_on', CASE WHEN r.member_id IS NOT NULL THEN coalesce(v_wo, true) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.email_studio_prefs_set(p_token uuid, p_unsubscribed boolean, p_topics_off text[], p_whats_on boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_club uuid;
BEGIN
  SELECT rc.*, c.club_id AS c_club INTO r
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
  IF p_whats_on IS NOT NULL AND r.member_id IS NOT NULL THEN
    INSERT INTO whats_on_member_prefs (member_id, club_id, whats_on_enabled, updated_at)
    VALUES (r.member_id, v_club, p_whats_on, now())
    ON CONFLICT (member_id) DO UPDATE SET whats_on_enabled = EXCLUDED.whats_on_enabled, updated_at = now();
  END IF;
  RETURN public.email_studio_prefs_get(p_token);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Scheduled sends: every 5 minutes, hand due campaigns to the email-studio function
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.email_studio_run_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
  c record;
  v_n int := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;
  FOR c IN
    SELECT id FROM marketing_campaigns
    WHERE studio AND (
          (status = 'scheduled' AND send_at <= now())
       OR (status = 'sending' AND updated_at < now() - interval '10 minutes'
           AND EXISTS (SELECT 1 FROM marketing_recipients r WHERE r.campaign_id = marketing_campaigns.id AND r.status IN ('queued', 'sending'))))
    ORDER BY send_at NULLS FIRST
    LIMIT 10
  LOOP
    UPDATE marketing_campaigns SET updated_at = now() WHERE id = c.id;
    PERFORM net.http_post(
      url := v_url || '/functions/v1/email-studio',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('action', 'run', 'campaign_id', c.id),
      timeout_milliseconds := 5000);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;


-- The sender takes people off the queue in small batches; two senders can never take the same person.
CREATE OR REPLACE FUNCTION public.email_studio_claim(p_campaign uuid, p_n int)
RETURNS SETOF public.marketing_recipients LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE marketing_recipients SET status = 'sending', claimed_at = now()
  WHERE id IN (SELECT id FROM marketing_recipients
               WHERE campaign_id = p_campaign
                 AND (status = 'queued' OR (status = 'sending' AND claimed_at < now() - interval '15 minutes'))
               ORDER BY created_at, id
               LIMIT greatest(1, least(p_n, 200))
               FOR UPDATE SKIP LOCKED)
  RETURNING *
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Permissions
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  f text;
BEGIN
  -- Internal: server only
  FOREACH f IN ARRAY ARRAY[
    'email_studio_people(uuid)', 'email_studio_rule_ids(uuid, jsonb)', 'email_studio_segment_ids(uuid, jsonb)',
    'email_studio_part(uuid, jsonb)', 'email_studio_recipients(uuid, jsonb, text)', 'email_studio_run_due()',
    'email_studio_claim(uuid, integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
  -- Admin screens (each checks the caller manages the club)
  FOREACH f IN ARRAY ARRAY[
    'email_studio_can_manage_org(uuid, uuid, uuid)', 'email_studio_audience_count(uuid, jsonb, text)', 'email_studio_home(uuid, integer)',
    'email_studio_report(uuid)', 'email_studio_member_activity(uuid, text)', 'email_studio_topics(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  -- Preferences page (anyone with the link)
  FOREACH f IN ARRAY ARRAY['email_studio_prefs_get(uuid)', 'email_studio_prefs_set(uuid, boolean, text[], boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'email-studio-due';
SELECT cron.schedule('email-studio-due', '*/5 * * * *', $$SELECT public.email_studio_run_due();$$);

NOTIFY pgrst, 'reload schema';
