/*
# Lock down anonymous access: Tracking, livestream, and racing tables

## Tables affected
- live_tracking_events, live_tracking_sessions, session_skipper_tracking,
  skipper_notifications_sent (tracking/GPS data - PII)
- livestream_archives, livestream_camera_sources, livestream_cameras,
  livestream_race_segments, livestream_sessions (infrastructure)
- heat_observers, quick_races, race_day_sign_on, race_roll_call_sessions,
  race_series, race_series_rounds, rc_rules (race management internals)

## Special cases
- race_day_sign_on: has kiosk INSERT/UPDATE for anonymous sign-on at physical
  terminals. Keep the kiosk write access but lock down reads.
- race_roll_call_sessions: has anonymous UPDATE for roll call. Keep that but
  lock down reads.
- quick_races: kiosk anonymous viewing stays for race display boards.
- livestream_cameras/sessions: may need anon for public embed viewing.
  Lock down camera_sources (infrastructure) but keep cameras/sessions readable
  for authenticated users.
*/

-- live_tracking_events: lock reads and writes to authenticated
DROP POLICY IF EXISTS "Org admins and public can view live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Public can view enabled live tracking events" ON live_tracking_events;
DROP POLICY IF EXISTS "Public can view live tracking events" ON live_tracking_events;
DROP POLICY IF EXISTS "Org admins can delete live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Org admins can create live tracking" ON live_tracking_events;
DROP POLICY IF EXISTS "Org admins can update live tracking" ON live_tracking_events;
CREATE POLICY "Auth view tracking events" ON live_tracking_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage tracking events" ON live_tracking_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update tracking events" ON live_tracking_events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete tracking events" ON live_tracking_events FOR DELETE TO authenticated USING (true);
REVOKE ALL ON live_tracking_events FROM anon;

-- live_tracking_sessions: lock to authenticated
DROP POLICY IF EXISTS "Club admins can view event sessions" ON live_tracking_sessions;
DROP POLICY IF EXISTS "Users can view own tracking sessions" ON live_tracking_sessions;
DROP POLICY IF EXISTS "Anyone can create tracking session" ON live_tracking_sessions;
DROP POLICY IF EXISTS "Anyone can expire old sessions" ON live_tracking_sessions;
CREATE POLICY "Auth view tracking sessions" ON live_tracking_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth create tracking sessions" ON live_tracking_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update tracking sessions" ON live_tracking_sessions FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON live_tracking_sessions FROM anon;

-- session_skipper_tracking: GPS/location PII - lock to authenticated
DROP POLICY IF EXISTS "Club admins can view event tracking" ON session_skipper_tracking;
DROP POLICY IF EXISTS "Users can view own skipper tracking" ON session_skipper_tracking;
DROP POLICY IF EXISTS "System can create skipper tracking" ON session_skipper_tracking;
DROP POLICY IF EXISTS "System can update skipper tracking" ON session_skipper_tracking;
CREATE POLICY "Auth view skipper tracking" ON session_skipper_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth create skipper tracking" ON session_skipper_tracking FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update skipper tracking" ON session_skipper_tracking FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON session_skipper_tracking FROM anon;

-- skipper_notifications_sent: notification logs - lock to authenticated
DROP POLICY IF EXISTS "Club admins can view event notifications" ON skipper_notifications_sent;
DROP POLICY IF EXISTS "Users can view own notifications" ON skipper_notifications_sent;
DROP POLICY IF EXISTS "System can create notifications" ON skipper_notifications_sent;
DROP POLICY IF EXISTS "System can update notifications" ON skipper_notifications_sent;
CREATE POLICY "Auth view notifications" ON skipper_notifications_sent FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth create notifications" ON skipper_notifications_sent FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update notifications" ON skipper_notifications_sent FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON skipper_notifications_sent FROM anon;

-- livestream_camera_sources: infrastructure credentials - lock to authenticated
DROP POLICY IF EXISTS "Anonymous can view cameras for active sessions" ON livestream_camera_sources;
DROP POLICY IF EXISTS "Anonymous can register cameras for active sessions" ON livestream_camera_sources;
DROP POLICY IF EXISTS "Anonymous can update cameras for active sessions" ON livestream_camera_sources;
CREATE POLICY "Auth view camera sources" ON livestream_camera_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth register camera sources" ON livestream_camera_sources FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update camera sources" ON livestream_camera_sources FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON livestream_camera_sources FROM anon;

-- livestream_cameras: lock to authenticated (public embed uses event_website tables)
DROP POLICY IF EXISTS "Anyone can view cameras for sessions" ON livestream_cameras;
DROP POLICY IF EXISTS "Anyone can register mobile cameras" ON livestream_cameras;
DROP POLICY IF EXISTS "Anyone can update mobile camera status" ON livestream_cameras;
CREATE POLICY "Auth view cameras" ON livestream_cameras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth register cameras" ON livestream_cameras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update cameras" ON livestream_cameras FOR UPDATE TO authenticated USING (true);
REVOKE ALL ON livestream_cameras FROM anon;

-- livestream_archives: lock to authenticated
DROP POLICY IF EXISTS "Public can view public archives" ON livestream_archives;
CREATE POLICY "Auth view archives" ON livestream_archives FOR SELECT TO authenticated USING (true);
REVOKE ALL ON livestream_archives FROM anon;

-- livestream_race_segments
DROP POLICY IF EXISTS "Public can view uploaded segments" ON livestream_race_segments;
CREATE POLICY "Auth view segments" ON livestream_race_segments FOR SELECT TO authenticated USING (true);
REVOKE ALL ON livestream_race_segments FROM anon;

-- livestream_sessions
DROP POLICY IF EXISTS "Anyone can view livestream sessions by ID" ON livestream_sessions;
CREATE POLICY "Auth view livestream sessions" ON livestream_sessions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON livestream_sessions FROM anon;

-- heat_observers: race official assignments
DROP POLICY IF EXISTS "Public can view heat observers for published events" ON heat_observers;
CREATE POLICY "Auth view heat observers" ON heat_observers FOR SELECT TO authenticated USING (true);
REVOKE ALL ON heat_observers FROM anon;

-- race_series: lock anon reads, keep authenticated
DROP POLICY IF EXISTS "Public can view race series" ON race_series;
DROP POLICY IF EXISTS "Public can view series" ON race_series;
REVOKE ALL ON race_series FROM anon;

-- race_series_rounds
DROP POLICY IF EXISTS "Public can view race series rounds" ON race_series_rounds;
REVOKE ALL ON race_series_rounds FROM anon;

-- rc_rules
DROP POLICY IF EXISTS "Anonymous users can read rules" ON rc_rules;
REVOKE ALL ON rc_rules FROM anon;

-- quick_races: keep anon READ for kiosk display boards
-- but ensure the policy is scoped (already has conditions for non-simulated)
-- Just leave the anon policies as-is since they serve kiosk displays

-- race_day_sign_on: keep anon INSERT/UPDATE for kiosk physical terminals
-- but lock down anonymous reads
DROP POLICY IF EXISTS "Anonymous can view sign-on entries for kiosk" ON race_day_sign_on;
REVOKE SELECT ON race_day_sign_on FROM anon;

-- race_roll_call_sessions: keep anon UPDATE for roll call terminals
-- but lock reads to authenticated
DROP POLICY IF EXISTS "Anyone can read enabled roll call sessions by token" ON race_roll_call_sessions;
CREATE POLICY "Auth read roll call sessions" ON race_roll_call_sessions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON race_roll_call_sessions FROM anon;
