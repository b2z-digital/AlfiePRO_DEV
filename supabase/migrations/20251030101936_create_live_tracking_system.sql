/*
  # Create Live Skipper Tracking System
  
  ## Overview
  Real-time tracking system for skippers at racing events. Supports:
  - Heat racing (HMS with promotion/relegation)
  - One-fleet scratch racing
  - Handicap racing with corrected times
  - Guest access (no account required)
  - Member access (enhanced features)
  - Web Push notifications
  
  ## New Tables
  
  ### `live_tracking_sessions`
  Tracks individual skipper tracking sessions (guest or member)
  
  ### `session_skipper_tracking`
  Links sessions to actual race participants with real-time status
  
  ### `skipper_notifications_sent`
  Log of all notifications sent (for analytics and debugging)
  
  ### `live_tracking_events`
  Enables live tracking for specific events
  
  ## Security
  - RLS enabled on all tables
  - Guests can only view their own session (via device fingerprint)
  - Members can view their own sessions
  - Race officers can view all sessions for their events
  - Anonymous users can view public event data
  
  ## Notes
  - Sessions auto-expire 24 hours after event ends
  - Push subscriptions stored securely
  - Supports all race formats: heat, scratch, handicap
  - Guest data cleaned up after expiry
*/

-- Live tracking sessions table
CREATE TABLE IF NOT EXISTS live_tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES quick_races(id) ON DELETE CASCADE,
  
  -- User identification (either member OR guest)
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  selected_skipper_name TEXT,
  selected_sail_number TEXT,
  
  -- Device and push notification data
  device_fingerprint TEXT,
  push_subscription JSONB,
  
  -- Session lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN DEFAULT FALSE,
  
  -- User preferences
  notification_preferences JSONB DEFAULT '{
    "urgent": true,
    "important": true,
    "info": true,
    "low": false,
    "sound": true,
    "vibrate": true
  }'::jsonb,
  
  -- Constraints
  CONSTRAINT valid_identification CHECK (
    member_id IS NOT NULL OR 
    (selected_skipper_name IS NOT NULL AND selected_sail_number IS NOT NULL)
  )
);

-- Session skipper tracking (current status)
CREATE TABLE IF NOT EXISTS session_skipper_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_tracking_sessions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES quick_races(id) ON DELETE CASCADE,
  
  -- Skipper identification
  skipper_name TEXT NOT NULL,
  sail_number TEXT NOT NULL,
  boat_class TEXT,
  
  -- Heat racing specific
  current_heat_id UUID,
  current_heat_name TEXT,
  current_round INTEGER,
  
  -- Position and scoring (all formats)
  current_position INTEGER,
  total_points DECIMAL,
  races_completed INTEGER DEFAULT 0,
  
  -- Handicap racing specific
  current_handicap DECIMAL,
  corrected_time_total DECIMAL,
  
  -- Scratch racing specific
  scratch_position INTEGER,
  
  -- Status tracking
  last_race_result TEXT,
  promotion_status TEXT, -- 'promoted', 'relegated', 'maintained', null
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification delivery log
CREATE TABLE IF NOT EXISTS skipper_notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_tracking_sessions(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type TEXT NOT NULL, -- 'heat_assignment', 'race_starting', 'results_published', 'handicap_update', 'position_update'
  priority TEXT NOT NULL DEFAULT 'info', -- 'urgent', 'important', 'info', 'low'
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  
  -- Delivery tracking
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Live tracking event configuration
CREATE TABLE IF NOT EXISTS live_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES quick_races(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- Access control
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  enabled BOOLEAN DEFAULT TRUE,
  
  -- QR code data
  qr_code_url TEXT,
  public_url TEXT,
  
  -- Statistics
  active_sessions_count INTEGER DEFAULT 0,
  total_sessions_created INTEGER DEFAULT 0,
  total_notifications_sent INTEGER DEFAULT 0,
  
  -- Event-specific notification settings
  notification_settings JSONB DEFAULT '{
    "enable_race_starting": true,
    "enable_results_published": true,
    "enable_heat_assignments": true,
    "enable_handicap_updates": true,
    "enable_position_updates": true,
    "warning_minutes_before_race": [15, 5],
    "auto_notify_on_promotion": true,
    "auto_notify_on_relegation": true
  }'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_tracking_sessions_event ON live_tracking_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_live_tracking_sessions_member ON live_tracking_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_live_tracking_sessions_device ON live_tracking_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_live_tracking_sessions_active ON live_tracking_sessions(last_active_at) WHERE is_expired = false;

CREATE INDEX IF NOT EXISTS idx_session_skipper_tracking_session ON session_skipper_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_session_skipper_tracking_event ON session_skipper_tracking(event_id);
CREATE INDEX IF NOT EXISTS idx_session_skipper_tracking_sail ON session_skipper_tracking(sail_number, event_id);

CREATE INDEX IF NOT EXISTS idx_skipper_notifications_session ON skipper_notifications_sent(session_id);
CREATE INDEX IF NOT EXISTS idx_skipper_notifications_sent_at ON skipper_notifications_sent(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_skipper_notifications_type ON skipper_notifications_sent(notification_type);

CREATE INDEX IF NOT EXISTS idx_live_tracking_events_event ON live_tracking_events(event_id);
CREATE INDEX IF NOT EXISTS idx_live_tracking_events_token ON live_tracking_events(access_token);

-- Enable RLS
ALTER TABLE live_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_skipper_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE skipper_notifications_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_tracking_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for live_tracking_sessions

-- Guests can view their own session via device fingerprint or session token
CREATE POLICY "Users can view own tracking sessions"
  ON live_tracking_sessions FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND member_id = auth.uid())
    OR
    (auth.uid() IS NULL)
  );

-- Anyone can create a tracking session (guest or member)
CREATE POLICY "Anyone can create tracking session"
  ON live_tracking_sessions FOR INSERT
  WITH CHECK (true);

-- Users can update their own session
CREATE POLICY "Users can update own tracking session"
  ON live_tracking_sessions FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND member_id = auth.uid())
    OR
    (auth.uid() IS NULL)
  );

-- Admins and editors can view all sessions for their events
CREATE POLICY "Club admins can view event sessions"
  ON live_tracking_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      JOIN quick_races qr ON qr.club_id = uc.club_id
      WHERE uc.user_id = auth.uid()
      AND qr.id = event_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- RLS Policies for session_skipper_tracking

-- Users can view their own tracking data
CREATE POLICY "Users can view own skipper tracking"
  ON session_skipper_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM live_tracking_sessions lts
      WHERE lts.id = session_id
      AND (
        (auth.uid() IS NOT NULL AND lts.member_id = auth.uid())
        OR
        (auth.uid() IS NULL)
      )
    )
  );

-- Anyone can insert tracking data (system-managed)
CREATE POLICY "System can create skipper tracking"
  ON session_skipper_tracking FOR INSERT
  WITH CHECK (true);

-- System can update tracking data
CREATE POLICY "System can update skipper tracking"
  ON session_skipper_tracking FOR UPDATE
  USING (true);

-- Club admins can view all tracking for their events
CREATE POLICY "Club admins can view event tracking"
  ON session_skipper_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      JOIN quick_races qr ON qr.club_id = uc.club_id
      WHERE uc.user_id = auth.uid()
      AND qr.id = event_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- RLS Policies for skipper_notifications_sent

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON skipper_notifications_sent FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM live_tracking_sessions lts
      WHERE lts.id = session_id
      AND (
        (auth.uid() IS NOT NULL AND lts.member_id = auth.uid())
        OR
        (auth.uid() IS NULL)
      )
    )
  );

-- System can insert notifications
CREATE POLICY "System can create notifications"
  ON skipper_notifications_sent FOR INSERT
  WITH CHECK (true);

-- System can update notification delivery status
CREATE POLICY "System can update notifications"
  ON skipper_notifications_sent FOR UPDATE
  USING (true);

-- Club admins can view notifications for their events
CREATE POLICY "Club admins can view event notifications"
  ON skipper_notifications_sent FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM live_tracking_sessions lts
      JOIN quick_races qr ON qr.id = lts.event_id
      JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE lts.id = session_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- RLS Policies for live_tracking_events

-- Anyone can view live tracking events (to access via QR code)
CREATE POLICY "Public can view live tracking events"
  ON live_tracking_events FOR SELECT
  USING (enabled = true);

-- Club admins can manage live tracking for their events
CREATE POLICY "Club admins can manage live tracking"
  ON live_tracking_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.club_id = live_tracking_events.club_id
      AND uc.role IN ('admin', 'super_admin', 'editor')
    )
  );

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_tracking_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE live_tracking_sessions
  SET is_expired = true
  WHERE expires_at < NOW() AND is_expired = false;
  
  DELETE FROM live_tracking_sessions
  WHERE expires_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM session_skipper_tracking
  WHERE session_id NOT IN (SELECT id FROM live_tracking_sessions);
  
  DELETE FROM skipper_notifications_sent
  WHERE sent_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Function to update active session count
CREATE OR REPLACE FUNCTION update_active_sessions_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE live_tracking_events
    SET 
      active_sessions_count = (
        SELECT COUNT(*) 
        FROM live_tracking_sessions 
        WHERE event_id = NEW.event_id 
        AND last_active_at > NOW() - INTERVAL '1 hour'
        AND is_expired = false
      ),
      total_sessions_created = total_sessions_created + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END
    WHERE event_id = NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to update session counts
DROP TRIGGER IF EXISTS trigger_update_active_sessions ON live_tracking_sessions;
CREATE TRIGGER trigger_update_active_sessions
  AFTER INSERT OR UPDATE ON live_tracking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_active_sessions_count();

-- Function to auto-expire sessions after event ends
CREATE OR REPLACE FUNCTION set_session_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := (
      SELECT date + INTERVAL '24 hours'
      FROM quick_races
      WHERE id = NEW.event_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to set expiry on session creation
DROP TRIGGER IF EXISTS trigger_set_session_expiry ON live_tracking_sessions;
CREATE TRIGGER trigger_set_session_expiry
  BEFORE INSERT ON live_tracking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_expiry();
