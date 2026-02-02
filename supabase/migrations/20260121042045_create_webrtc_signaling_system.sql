/*
  # Create WebRTC Signaling System for Livestream Cameras

  1. New Tables
    - `webrtc_signaling`
      - `id` (uuid, primary key)
      - `camera_id` (uuid, references livestream_camera_sources)
      - `session_id` (uuid, references livestream_sessions)
      - `signal_type` (text: 'offer', 'answer', 'ice_candidate')
      - `signal_data` (jsonb, contains SDP or ICE candidate)
      - `from_role` (text: 'camera' or 'viewer')
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz)

  2. Security
    - Enable RLS on `webrtc_signaling` table
    - Allow camera devices to insert/read signals
    - Allow session viewers to insert/read signals

  3. Notes
    - Signals are ephemeral and should be cleaned up after connection
    - Use Supabase Realtime to subscribe to new signals
*/

-- Create the webrtc_signaling table
CREATE TABLE IF NOT EXISTS webrtc_signaling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid REFERENCES livestream_camera_sources(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice_candidate')),
  signal_data jsonb NOT NULL,
  from_role text NOT NULL CHECK (from_role IN ('camera', 'viewer')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '5 minutes')
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_camera_id ON webrtc_signaling(camera_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_session_id ON webrtc_signaling(session_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signaling_expires_at ON webrtc_signaling(expires_at);

-- Enable RLS
ALTER TABLE webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for mobile cameras (they connect without auth)
CREATE POLICY "Allow anonymous insert signals"
  ON webrtc_signaling
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous read signals"
  ON webrtc_signaling
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous delete expired signals"
  ON webrtc_signaling
  FOR DELETE
  TO anon
  USING (expires_at < now());

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated insert signals"
  ON webrtc_signaling
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated read signals"
  ON webrtc_signaling
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete signals"
  ON webrtc_signaling
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable realtime for signaling table
ALTER PUBLICATION supabase_realtime ADD TABLE webrtc_signaling;

-- Function to clean up expired signals (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_webrtc_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM webrtc_signaling WHERE expires_at < now();
END;
$$;
