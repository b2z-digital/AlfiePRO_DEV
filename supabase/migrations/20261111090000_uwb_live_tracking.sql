-- Live Tracking (UWB): open the section to the club that runs it, add the settings the new screens
-- need, and link tracking sessions to races in Race Management. Nothing here turns tracking on for
-- anyone: a club only sees Live Tracking once it has an active tracking config.

-- ── Roles ──
-- Race officers run tracking: the club's admins, PROs and race scorers (and super admins).
CREATE OR REPLACE FUNCTION public.uwb_can_run(p_club uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.user_clubs uc
    WHERE uc.club_id = p_club AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'pro', 'race_scorer')
  );
$$;
-- Members of the club (or super admins) can watch.
CREATE OR REPLACE FUNCTION public.uwb_can_watch(p_club uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.user_is_club_member(p_club, auth.uid());
$$;
-- The club a tracking config belongs to.
CREATE OR REPLACE FUNCTION public.uwb_config_club(p_config uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT club_id FROM public.uwb_tracking_configs WHERE id = p_config; $$;
REVOKE ALL ON FUNCTION public.uwb_can_run(uuid), public.uwb_can_watch(uuid), public.uwb_config_club(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uwb_can_run(uuid), public.uwb_can_watch(uuid), public.uwb_config_club(uuid) TO authenticated;

-- ── Settings ──
ALTER TABLE public.uwb_tracking_configs
  -- How finishes reach Race Management: not at all, filled in for the PRO to confirm, or straight in.
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'confirm' CHECK (scoring_mode IN ('off', 'confirm', 'auto')),
  -- Who can watch live: anyone with the link, club members, or race officers only.
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'officers')),
  -- How far behind live the public link runs (outside help, rule 41).
  ADD COLUMN IF NOT EXISTS public_delay_s smallint NOT NULL DEFAULT 10 CHECK (public_delay_s BETWEEN 0 AND 120),
  -- The system's position accuracy: calls closer than this are "too close to call".
  ADD COLUMN IF NOT EXISTS accuracy_m numeric NOT NULL DEFAULT 0.05 CHECK (accuracy_m BETWEEN 0.005 AND 1),
  -- Per class: tag-to-bow distance and hull length (m), for starts, finishes and contact.
  ADD COLUMN IF NOT EXISTS class_geometry jsonb NOT NULL DEFAULT '{"IOM":{"bow":0.42,"length":1.0},"DF95":{"bow":0.4,"length":0.95},"10R":{"bow":0.55,"length":1.3},"Marblehead":{"bow":0.55,"length":1.29},"A Class":{"bow":0.8,"length":1.9}}',
  -- Race officer alerts: stopped boat, lost tag, close quarters, keep-out zone, anchor battery.
  ADD COLUMN IF NOT EXISTS alerts jsonb NOT NULL DEFAULT '{"stopped_s":20,"lost_s":5,"close_m":0.3,"keepout_s":5,"battery_pct":20}';
UPDATE public.uwb_tracking_configs SET scoring_mode = CASE WHEN auto_scoring_enabled THEN 'confirm' ELSE 'off' END;

-- Tags: the boat from the boat shed, and that boat's own geometry if it differs from its class.
ALTER TABLE public.uwb_tags
  ADD COLUMN IF NOT EXISTS boat_id uuid REFERENCES public.member_boats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bow_offset_m numeric CHECK (bow_offset_m IS NULL OR bow_offset_m BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS hull_length_m numeric CHECK (hull_length_m IS NULL OR hull_length_m BETWEEN 0.3 AND 4),
  ADD COLUMN IF NOT EXISTS firmware text;

-- Sessions: which race in Race Management, the gun (from StartBox), and what was sent to scoring.
ALTER TABLE public.uwb_race_sessions
  ADD COLUMN IF NOT EXISTS race_no smallint CHECK (race_no IS NULL OR race_no BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS gun_at timestamptz,
  ADD COLUMN IF NOT EXISTS scoring jsonb;
CREATE INDEX IF NOT EXISTS uwb_race_sessions_event_idx ON public.uwb_race_sessions (event_id, race_no) WHERE event_id IS NOT NULL;

-- Course layouts: keep-out zones drawn by the race officer.
ALTER TABLE public.uwb_course_layouts ADD COLUMN IF NOT EXISTS zones jsonb NOT NULL DEFAULT '[]';

-- Race events: close encounters, penalty turns, stopped boats and keep-out alerts too.
ALTER TABLE public.uwb_race_events DROP CONSTRAINT IF EXISTS uwb_event_type_check;
ALTER TABLE public.uwb_race_events ADD CONSTRAINT uwb_event_type_check CHECK (event_type IN (
  'start_crossing', 'finish_crossing', 'mark_rounding', 'ocs', 'dnf', 'dsq', 'recall',
  'encounter', 'penalty_turn', 'stopped', 'keepout'));

-- ── Who sees and changes what ──
-- The config: race officers of the club read it (never the key, through club_tracking for everyone
-- else); club admins change it.
DROP POLICY IF EXISTS "Club admins can view their UWB config" ON public.uwb_tracking_configs;
CREATE POLICY "uwb configs: race officers read" ON public.uwb_tracking_configs FOR SELECT TO authenticated
  USING (public.uwb_can_run(club_id));
CREATE POLICY "uwb configs: club admins change" ON public.uwb_tracking_configs FOR UPDATE TO authenticated
  USING (public.is_club_admin(club_id)) WITH CHECK (public.is_club_admin(club_id));

-- Kit and courses: members see them, race officers change them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['uwb_anchors', 'uwb_tags', 'uwb_course_layouts', 'uwb_race_sessions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "uwb: members see" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "uwb: race officers change" ON public.%I', t);
    EXECUTE format('CREATE POLICY "uwb: members see" ON public.%I FOR SELECT TO authenticated USING (public.uwb_can_watch(public.uwb_config_club(config_id)))', t);
    EXECUTE format('CREATE POLICY "uwb: race officers change" ON public.%I FOR ALL TO authenticated USING (public.uwb_can_run(public.uwb_config_club(config_id))) WITH CHECK (public.uwb_can_run(public.uwb_config_club(config_id)))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Club admins can view their anchors" ON public.uwb_anchors;
DROP POLICY IF EXISTS "Club admins can view their tags" ON public.uwb_tags;
DROP POLICY IF EXISTS "Club admins can view their course layouts" ON public.uwb_course_layouts;
DROP POLICY IF EXISTS "Authenticated users can view live race sessions" ON public.uwb_race_sessions;

-- Positions and events: the club's members (race officers always; others when the club lets
-- members watch). Anyone else goes through uwb_public_positions, which keeps the delay.
CREATE OR REPLACE FUNCTION public.uwb_session_watchable(p_session uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.uwb_race_sessions s JOIN public.uwb_tracking_configs c ON c.id = s.config_id
    WHERE s.id = p_session AND (public.uwb_can_run(c.club_id) OR (c.visibility <> 'officers' AND public.uwb_can_watch(c.club_id)))
  );
$$;
REVOKE ALL ON FUNCTION public.uwb_session_watchable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uwb_session_watchable(uuid) TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can view position data for live or finished" ON public.uwb_position_data;
DROP POLICY IF EXISTS "uwb positions: the club watches" ON public.uwb_position_data;
CREATE POLICY "uwb positions: the club watches" ON public.uwb_position_data FOR SELECT TO authenticated
  USING (session_id IN (SELECT s.id FROM public.uwb_race_sessions s WHERE public.uwb_session_watchable(s.id)));
DROP POLICY IF EXISTS "Authenticated users can view race events for live or finished s" ON public.uwb_race_events;
DROP POLICY IF EXISTS "uwb events: the club watches" ON public.uwb_race_events;
CREATE POLICY "uwb events: the club watches" ON public.uwb_race_events FOR SELECT TO authenticated
  USING (session_id IN (SELECT s.id FROM public.uwb_race_sessions s WHERE public.uwb_session_watchable(s.id)));
DROP POLICY IF EXISTS "uwb events: race officers record" ON public.uwb_race_events;
CREATE POLICY "uwb events: race officers record" ON public.uwb_race_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.uwb_race_sessions s WHERE s.id = session_id AND public.uwb_can_run(public.uwb_config_club(s.config_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.uwb_race_sessions s WHERE s.id = session_id AND public.uwb_can_run(public.uwb_config_club(s.config_id))));

-- ── What the app asks first: is tracking on at this club, and how? (no key) ──
CREATE OR REPLACE FUNCTION public.club_tracking(p_club uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'config_id', c.id, 'active', c.is_active, 'scoring_mode', c.scoring_mode, 'visibility', c.visibility,
    'public_delay_s', c.public_delay_s, 'accuracy_m', c.accuracy_m, 'class_geometry', c.class_geometry,
    'alerts', c.alerts, 'update_hz', c.update_frequency_hz, 'rounding_m', c.rounding_threshold_m,
    'can_run', public.uwb_can_run(c.club_id), 'can_manage', public.is_club_admin(c.club_id) OR public.is_super_admin())
  FROM public.uwb_tracking_configs c
  WHERE c.club_id = p_club AND public.uwb_can_watch(c.club_id)
  ORDER BY c.is_active DESC, c.created_at
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.club_tracking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_tracking(uuid) TO authenticated;

-- ── The public link: positions of a public club's session, held back by its delay ──
CREATE OR REPLACE FUNCTION public.uwb_public_positions(p_session uuid, p_since timestamptz)
RETURNS TABLE (tag_id uuid, position_x numeric, position_y numeric, heading_deg numeric, speed_mps numeric, recorded_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.tag_id, p.position_x, p.position_y, p.heading_deg, p.speed_mps, p.recorded_at
  FROM public.uwb_position_data p
  JOIN public.uwb_race_sessions s ON s.id = p.session_id
  JOIN public.uwb_tracking_configs c ON c.id = s.config_id
  WHERE p.session_id = p_session AND c.is_active AND c.visibility = 'public'
    AND p.recorded_at > p_since AND p.recorded_at <= now() - make_interval(secs => c.public_delay_s)
  ORDER BY p.recorded_at
  LIMIT 20000;
$$;
GRANT EXECUTE ON FUNCTION public.uwb_public_positions(uuid, timestamptz) TO anon, authenticated;
