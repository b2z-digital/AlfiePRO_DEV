/*
  # Record races mode + livestream credit (clubs pay for their own livestreams)

  1. Record races mode (broadcast_mode = 'races_only', now for every filming method)
     - Members are never notified for a record-only broadcast.
     - Record-only is always free and never needs credit.

  2. Livestream credit
     - livestream_billing_settings   one row: prices (AUD cents), free test minutes, top-up packs,
                                     and `enforce` (off until you switch it on).
     - livestream_credit_ledger      every top-up (+) and broadcast charge (-) per club.
                                     Balance = sum(amount_cents).
     - livestream_credit_checkouts   Stripe Checkout sessions waiting to be confirmed.
     - livestream_viewer_minutes     one row per viewer per minute while live (viewer minutes).

     Price of a livestream = hours live × hourly rate (device/encoder or cloud production)
                           + viewer minutes ÷ 1000 × viewer rate.
     Test broadcasts: the first `free_test_minutes` live minutes each month are free, and test
     viewers are never charged.

     - A broadcast is charged once, when it ends (status live → ended).
     - Going live publicly (or making a live test public) is refused by the database when
       `enforce` is on and the club's balance is below `min_balance_cents`.
     - Clubs in `exempt_club_ids` are never charged or blocked.

  3. Functions for the app
     - livestream_credit_summary(club)           balance, prices, this month's test minutes, history
     - livestream_viewer_ping(session, viewer)   called by AlfieTV once a minute per viewer
     - livestream_credit_adjust(club, cents, note)  super admin: manual credit or refund
     - livestream_bill_session(session)          internal (end-of-broadcast trigger)
*/

-- ── 1. Record-only broadcasts never notify ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_livestream_go_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_title text;
  v_already_notified boolean;
BEGIN
  IF (NEW.status = 'live' OR NEW.status = 'broadcasting')
     AND (OLD.status IS DISTINCT FROM 'live' AND OLD.status IS DISTINCT FROM 'broadcasting')
     AND NEW.club_id IS NOT NULL
     AND NEW.is_public = true
     AND coalesce(NEW.broadcast_mode, 'live') <> 'races_only'
  THEN
    UPDATE livestream_sessions
    SET go_live_notified_at = NOW()
    WHERE id = NEW.id
      AND go_live_notified_at IS NULL
    RETURNING true INTO v_already_notified;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_session_title := COALESCE(NEW.title, 'Live Stream');

    INSERT INTO notifications (user_id, club_id, type, subject, body, notification_category, push_status, link_url)
    SELECT
      uc.user_id,
      NEW.club_id,
      'general',
      'Now Streaming: ' || v_session_title,
      v_session_title || ' is now live! Tap to watch.',
      'calendar_events',
      'pending',
      '/alfie-tv/' || NEW.id || '?live=1'
    FROM user_clubs uc
    LEFT JOIN user_notification_preferences unp ON unp.user_id = uc.user_id
    WHERE uc.club_id = NEW.club_id
      AND (unp.notify_calendar_events IS NULL OR unp.notify_calendar_events = true)
      AND (unp.push_notifications IS NULL OR unp.push_notifications = true);
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 2. Settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.livestream_billing_settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  enforce                boolean NOT NULL DEFAULT false,
  currency               text    NOT NULL DEFAULT 'aud',
  device_hour_cents      integer NOT NULL DEFAULT 100,   -- this laptop/iPad or pro encoder, per hour live
  cloud_hour_cents       integer NOT NULL DEFAULT 500,   -- cloud production, per hour live
  viewer_unit_minutes    integer NOT NULL DEFAULT 1000,
  viewer_unit_cents      integer NOT NULL DEFAULT 300,   -- per 1000 viewer minutes
  free_test_minutes      integer NOT NULL DEFAULT 120,   -- per club per month
  min_balance_cents      integer NOT NULL DEFAULT 500,   -- needed to go live
  low_balance_cents      integer NOT NULL DEFAULT 1000,  -- warn below this
  packs_cents            integer[] NOT NULL DEFAULT '{2000,5000,10000}',
  exempt_club_ids        uuid[]  NOT NULL DEFAULT '{}',
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.livestream_billing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.livestream_billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone signed in can read livestream prices" ON public.livestream_billing_settings;
CREATE POLICY "Anyone signed in can read livestream prices" ON public.livestream_billing_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admins can change livestream prices" ON public.livestream_billing_settings;
CREATE POLICY "Super admins can change livestream prices" ON public.livestream_billing_settings
  FOR UPDATE TO authenticated USING (is_platform_super_admin()) WITH CHECK (is_platform_super_admin());

-- ── Ledger and checkouts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.livestream_credit_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  amount_cents        integer NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('topup', 'usage', 'adjustment')),
  session_id          uuid REFERENCES public.livestream_sessions(id) ON DELETE SET NULL,
  stripe_checkout_id  text UNIQUE,
  description         text,
  live_minutes        numeric(10,2),
  viewer_minutes      integer,
  is_test             boolean NOT NULL DEFAULT false,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS livestream_credit_ledger_club_idx ON public.livestream_credit_ledger (club_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS livestream_credit_ledger_one_charge_per_session
  ON public.livestream_credit_ledger (session_id) WHERE kind = 'usage';

CREATE TABLE IF NOT EXISTS public.livestream_credit_checkouts (
  stripe_checkout_id  text PRIMARY KEY,
  club_id             uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  amount_cents        integer NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS livestream_credit_checkouts_club_idx ON public.livestream_credit_checkouts (club_id, status);

-- Read through livestream_credit_summary(); written only by the functions here and the
-- livestream-credit edge function (service role)
ALTER TABLE public.livestream_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livestream_credit_checkouts ENABLE ROW LEVEL SECURITY;

-- ── Viewer minutes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.livestream_viewer_minutes (
  session_id  uuid NOT NULL REFERENCES public.livestream_sessions(id) ON DELETE CASCADE,
  viewer_key  text NOT NULL,
  minute      timestamptz NOT NULL,
  PRIMARY KEY (session_id, minute, viewer_key)
);
ALTER TABLE public.livestream_viewer_minutes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.livestream_sessions
  ADD COLUMN IF NOT EXISTS ended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS billed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS billed_cents integer;

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.livestream_credit_balance(p_club uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(amount_cents), 0)::integer FROM livestream_credit_ledger WHERE club_id = p_club;
$$;
REVOKE ALL ON FUNCTION public.livestream_credit_balance(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.livestream_test_minutes_used(p_club uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(live_minutes), 0)
  FROM livestream_credit_ledger
  WHERE club_id = p_club AND kind = 'usage' AND is_test
    AND created_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION public.livestream_test_minutes_used(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.livestream_can_manage_credit(p_club uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_platform_super_admin() OR EXISTS (
    SELECT 1 FROM user_clubs uc
    WHERE uc.club_id = p_club AND uc.user_id = auth.uid() AND uc.role IN ('admin', 'editor', 'race_scorer')
  );
$$;
REVOKE ALL ON FUNCTION public.livestream_can_manage_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.livestream_can_manage_credit(uuid) TO authenticated;

-- ── Charge a broadcast (once, when it ends) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.livestream_bill_session(p_session uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        livestream_sessions%ROWTYPE;
  cfg      livestream_billing_settings%ROWTYPE;
  v_live   numeric := 0;
  v_bill   numeric := 0;
  v_views  integer := 0;
  v_rate   integer;
  v_free   numeric;
  v_cents  integer := 0;
  v_desc   text;
BEGIN
  SELECT * INTO s FROM livestream_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.billed_at IS NOT NULL OR s.club_id IS NULL THEN RETURN 0; END IF;
  SELECT * INTO cfg FROM livestream_billing_settings WHERE id;

  IF coalesce(s.broadcast_mode, 'live') = 'races_only' OR s.actual_start_time IS NULL OR s.club_id = ANY (cfg.exempt_club_ids) THEN
    UPDATE livestream_sessions SET billed_at = now(), billed_cents = 0 WHERE id = p_session;
    RETURN 0;
  END IF;

  v_live  := round(greatest(0, extract(epoch FROM coalesce(s.end_time, s.ended_at, now()) - s.actual_start_time) / 60.0)::numeric, 2);
  v_rate  := CASE WHEN s.engine = 'cloud' THEN cfg.cloud_hour_cents ELSE cfg.device_hour_cents END;
  SELECT count(*) INTO v_views FROM livestream_viewer_minutes WHERE session_id = p_session;

  IF s.is_public = false THEN
    v_free  := greatest(0, cfg.free_test_minutes - livestream_test_minutes_used(s.club_id));
    v_bill  := greatest(0, v_live - v_free);
    v_cents := ceil(v_bill / 60.0 * v_rate)::integer;            -- test viewers are free
    v_desc  := 'Test broadcast: ' || coalesce(s.title, 'Untitled');
  ELSE
    v_cents := ceil(v_live / 60.0 * v_rate + v_views::numeric / greatest(cfg.viewer_unit_minutes, 1) * cfg.viewer_unit_cents)::integer;
    v_desc  := coalesce(s.title, 'Livestream');
  END IF;

  INSERT INTO livestream_credit_ledger (club_id, amount_cents, kind, session_id, description, live_minutes, viewer_minutes, is_test)
  VALUES (s.club_id, -v_cents, 'usage', p_session, v_desc, v_live, v_views, s.is_public = false)
  ON CONFLICT DO NOTHING;

  UPDATE livestream_sessions SET billed_at = now(), billed_cents = v_cents WHERE id = p_session;
  RETURN v_cents;
END;
$$;
REVOKE ALL ON FUNCTION public.livestream_bill_session(uuid) FROM PUBLIC, anon, authenticated;

-- ── Triggers: refuse to go live without credit; charge when it ends ─────────
CREATE OR REPLACE FUNCTION public.livestream_billing_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg livestream_billing_settings%ROWTYPE;
  v_balance integer;
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' AND NEW.ended_at IS NULL THEN
    NEW.ended_at := now();
  END IF;

  IF NEW.status = 'live'
     AND coalesce(NEW.broadcast_mode, 'live') = 'live'
     AND NEW.club_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'live' OR (OLD.is_public = false AND NEW.is_public = true))
  THEN
    SELECT * INTO cfg FROM livestream_billing_settings WHERE id;
    IF cfg.enforce AND NOT (NEW.club_id = ANY (cfg.exempt_club_ids)) THEN
      v_balance := livestream_credit_balance(NEW.club_id);
      IF NEW.is_public = false THEN
        -- Tests: free minutes left this month, or enough credit
        IF livestream_test_minutes_used(NEW.club_id) >= cfg.free_test_minutes AND v_balance < cfg.min_balance_cents THEN
          RAISE EXCEPTION 'LIVESTREAM_CREDIT: This month''s free test minutes are used up. Add livestream credit to keep testing, or record races instead (free).' USING ERRCODE = 'P0001';
        END IF;
      ELSIF v_balance < cfg.min_balance_cents THEN
        RAISE EXCEPTION 'LIVESTREAM_CREDIT: Not enough livestream credit to go live (balance $%). Add credit, or record races instead (free).',
          to_char(v_balance / 100.0, 'FM999990.00') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS livestream_billing_before_update ON public.livestream_sessions;
CREATE TRIGGER livestream_billing_before_update
  BEFORE UPDATE OF status, is_public ON public.livestream_sessions
  FOR EACH ROW EXECUTE FUNCTION public.livestream_billing_before_update();

CREATE OR REPLACE FUNCTION public.livestream_billing_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' AND NEW.billed_at IS NULL THEN
    PERFORM livestream_bill_session(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS livestream_billing_after_update ON public.livestream_sessions;
CREATE TRIGGER livestream_billing_after_update
  AFTER UPDATE OF status ON public.livestream_sessions
  FOR EACH ROW EXECUTE FUNCTION public.livestream_billing_after_update();

-- ── Viewer minutes (AlfieTV pings once a minute while a viewer watches) ─────
CREATE OR REPLACE FUNCTION public.livestream_viewer_ping(p_session uuid, p_viewer text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minute timestamptz := date_trunc('minute', now());
  v_now    integer;
BEGIN
  IF p_viewer IS NULL OR length(p_viewer) NOT BETWEEN 8 AND 64 THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM livestream_sessions
    WHERE id = p_session AND status = 'live' AND coalesce(broadcast_mode, 'live') = 'live'
  ) THEN RETURN; END IF;
  -- Ceiling against made-up viewers inflating a club's bill
  IF (SELECT count(*) FROM livestream_viewer_minutes WHERE session_id = p_session AND minute = v_minute) >= 3000 THEN
    RETURN;
  END IF;

  INSERT INTO livestream_viewer_minutes (session_id, viewer_key, minute)
  VALUES (p_session, p_viewer, v_minute)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(DISTINCT viewer_key) INTO v_now
  FROM livestream_viewer_minutes
  WHERE session_id = p_session AND minute >= v_minute - interval '1 minute';

  UPDATE livestream_sessions
  SET viewer_count = v_now, peak_viewers = greatest(coalesce(peak_viewers, 0), v_now)
  WHERE id = p_session AND (viewer_count IS DISTINCT FROM v_now OR coalesce(peak_viewers, 0) < v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.livestream_viewer_ping(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.livestream_viewer_ping(uuid, text) TO anon, authenticated;

-- ── Summary for the app ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.livestream_credit_summary(p_club uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg livestream_billing_settings%ROWTYPE;
BEGIN
  IF NOT livestream_can_manage_credit(p_club) THEN
    RAISE EXCEPTION 'You do not have access to this club''s livestream credit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg FROM livestream_billing_settings WHERE id;
  RETURN jsonb_build_object(
    'balance_cents', livestream_credit_balance(p_club),
    'exempt', p_club = ANY (cfg.exempt_club_ids),
    'test_minutes_used', livestream_test_minutes_used(p_club),
    'settings', jsonb_build_object(
      'enforce', cfg.enforce, 'currency', cfg.currency,
      'device_hour_cents', cfg.device_hour_cents, 'cloud_hour_cents', cfg.cloud_hour_cents,
      'viewer_unit_minutes', cfg.viewer_unit_minutes, 'viewer_unit_cents', cfg.viewer_unit_cents,
      'free_test_minutes', cfg.free_test_minutes, 'min_balance_cents', cfg.min_balance_cents,
      'low_balance_cents', cfg.low_balance_cents, 'packs_cents', to_jsonb(cfg.packs_cents)
    ),
    'history', coalesce((
      SELECT jsonb_agg(h ORDER BY h.created_at DESC) FROM (
        SELECT id, amount_cents, kind, description, live_minutes, viewer_minutes, is_test, created_at
        FROM livestream_credit_ledger WHERE club_id = p_club
        ORDER BY created_at DESC LIMIT 30
      ) h
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.livestream_credit_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.livestream_credit_summary(uuid) TO authenticated;

-- ── Super admin: manual credit / refund ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.livestream_credit_adjust(p_club uuid, p_cents integer, p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can adjust livestream credit' USING ERRCODE = '42501';
  END IF;
  IF p_cents = 0 OR abs(p_cents) > 1000000 THEN
    RAISE EXCEPTION 'Enter an amount between -$10,000 and $10,000' USING ERRCODE = '22023';
  END IF;
  INSERT INTO livestream_credit_ledger (club_id, amount_cents, kind, description, created_by)
  VALUES (p_club, p_cents, 'adjustment', left(coalesce(nullif(trim(p_note), ''), 'Adjustment'), 200), auth.uid());
  RETURN livestream_credit_balance(p_club);
END;
$$;
REVOKE ALL ON FUNCTION public.livestream_credit_adjust(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.livestream_credit_adjust(uuid, integer, text) TO authenticated;
