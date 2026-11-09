/*
  # Mobile camera QR links that work without signing in (browser "device" engine)

  Since the anon lockdown (20260925213827) a phone that is not signed in to AlfiePRO could not
  open /mobile-stream/<session>: it read and wrote livestream_sessions, livestream_camera_sources
  and webrtc_signaling directly, and anon has no access to those tables.

  Instead of reopening the tables, the QR now carries a secret, expiring key (the same
  livestream_camera_links row the cloud engine uses; one engine per session). A phone holding the
  key can do only what a camera needs, for that one session, through these functions:

  - create_mobile_camera_link(session)       signed-in club member / session creator → key + expiry
  - mobile_cam_session(session, key)          title + status
  - mobile_cam_register(session, key, ...)    register or reconnect this phone as a camera
  - mobile_cam_set_status(session, key, ...)  connected / streaming / disconnected
  - mobile_cam_signal(session, key, ...)      send offer / ICE candidates (as 'camera')
  - mobile_cam_viewer_signals(session, key, ...) read the viewer's answer / ICE candidates

  Tables, policies and grants are unchanged.
*/

-- ── Key check (internal) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mobile_cam_key_ok(p_session uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_key), 0) >= 32 AND EXISTS (
    SELECT 1 FROM livestream_camera_links l
    WHERE l.session_id = p_session AND l.join_key = p_key AND l.expires_at > now()
  );
$$;
REVOKE ALL ON FUNCTION public.mobile_cam_key_ok(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Create / reuse a link (signed-in, same access as adding a camera today) ─
CREATE OR REPLACE FUNCTION public.create_mobile_camera_link(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link livestream_camera_links%ROWTYPE;
  v_key  text;
  v_exp  timestamptz := now() + interval '24 hours';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a camera link' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM livestream_sessions ls
    WHERE ls.id = p_session
      AND (ls.created_by = auth.uid()
           OR ls.club_id IN (SELECT uc.club_id FROM user_clubs uc WHERE uc.user_id = auth.uid()))
  ) THEN
    RAISE EXCEPTION 'You do not have access to this livestream' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link FROM livestream_camera_links WHERE session_id = p_session;
  IF FOUND AND v_link.expires_at > now() + interval '2 hours' THEN
    RETURN jsonb_build_object('key', v_link.join_key, 'expires_at', v_link.expires_at);
  END IF;

  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO livestream_camera_links (session_id, join_key, expires_at)
  VALUES (p_session, v_key, v_exp)
  ON CONFLICT (session_id) DO UPDATE SET join_key = excluded.join_key, expires_at = excluded.expires_at, created_at = now();

  RETURN jsonb_build_object('key', v_key, 'expires_at', v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.create_mobile_camera_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_mobile_camera_link(uuid) TO authenticated;

-- ── Phone-side functions (anon or signed-in, key required) ─────────────────
CREATE OR REPLACE FUNCTION public.mobile_cam_session(p_session uuid, p_key text)
RETURNS TABLE (id uuid, title text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT mobile_cam_key_ok(p_session, p_key) THEN
    RAISE EXCEPTION 'This camera link is not valid or has expired. Ask for a new QR code.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT ls.id, ls.title::text, ls.status::text FROM livestream_sessions ls WHERE ls.id = p_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_cam_register(p_session uuid, p_key text, p_fingerprint text, p_device_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cam   uuid;
  v_count integer;
  v_name  text := left(coalesce(nullif(trim(p_device_name), ''), 'Phone'), 60);
BEGIN
  IF NOT mobile_cam_key_ok(p_session, p_key) THEN
    RAISE EXCEPTION 'This camera link is not valid or has expired. Ask for a new QR code.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_fingerprint, '') <> '' THEN
    SELECT c.id INTO v_cam FROM livestream_camera_sources c
    WHERE c.livestream_session_id = p_session AND c.camera_type = 'mobile' AND c.device_fingerprint = p_fingerprint
    LIMIT 1;
  END IF;

  IF v_cam IS NOT NULL THEN
    DELETE FROM webrtc_signaling WHERE camera_id = v_cam;
    UPDATE livestream_camera_sources SET status = 'connected', last_connected_at = now(), updated_at = now() WHERE id = v_cam;
    RETURN v_cam;
  END IF;

  SELECT count(*) + 1 INTO v_count FROM livestream_camera_sources c
  WHERE c.livestream_session_id = p_session AND c.camera_type = 'mobile';

  INSERT INTO livestream_camera_sources (livestream_session_id, camera_name, camera_type, status, is_primary, position, device_fingerprint, last_connected_at)
  VALUES (p_session,
          CASE WHEN v_count > 1 THEN 'Mobile ' || v_count || ' - ' || v_name ELSE 'Mobile - ' || v_name END,
          'mobile', 'connected', false, v_count, nullif(left(p_fingerprint, 100), ''), now())
  RETURNING id INTO v_cam;
  RETURN v_cam;
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_cam_set_status(p_session uuid, p_key text, p_camera uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT mobile_cam_key_ok(p_session, p_key) THEN
    RAISE EXCEPTION 'This camera link is not valid or has expired. Ask for a new QR code.' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('connected', 'streaming', 'disconnected') THEN
    RAISE EXCEPTION 'Invalid camera status' USING ERRCODE = '22023';
  END IF;
  UPDATE livestream_camera_sources SET status = p_status, updated_at = now()
  WHERE id = p_camera AND livestream_session_id = p_session AND camera_type = 'mobile';
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_cam_signal(p_session uuid, p_key text, p_camera uuid, p_type text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT mobile_cam_key_ok(p_session, p_key) THEN
    RAISE EXCEPTION 'This camera link is not valid or has expired. Ask for a new QR code.' USING ERRCODE = '42501';
  END IF;
  IF p_type NOT IN ('offer', 'ice_candidate') THEN
    RAISE EXCEPTION 'Invalid signal type' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM livestream_camera_sources c WHERE c.id = p_camera AND c.livestream_session_id = p_session) THEN
    RAISE EXCEPTION 'Camera not found for this livestream' USING ERRCODE = '22023';
  END IF;
  INSERT INTO webrtc_signaling (camera_id, session_id, signal_type, signal_data, from_role)
  VALUES (p_camera, p_session, p_type, p_data, 'camera');
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_cam_viewer_signals(p_session uuid, p_key text, p_camera uuid, p_type text)
RETURNS TABLE (id uuid, signal_type text, signal_data jsonb, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT mobile_cam_key_ok(p_session, p_key) THEN
    RAISE EXCEPTION 'This camera link is not valid or has expired. Ask for a new QR code.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.id, s.signal_type, s.signal_data, s.created_at
    FROM webrtc_signaling s
    WHERE s.camera_id = p_camera AND s.session_id = p_session AND s.from_role = 'viewer'
      AND (p_type IS NULL OR s.signal_type = p_type)
    ORDER BY s.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_cam_session(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mobile_cam_register(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mobile_cam_set_status(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mobile_cam_signal(uuid, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mobile_cam_viewer_signals(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_cam_session(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_cam_register(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_cam_set_status(uuid, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_cam_signal(uuid, text, uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_cam_viewer_signals(uuid, text, uuid, text) TO anon, authenticated;
