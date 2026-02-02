/*
  # Enable Realtime for Live Tracking Tables
  
  Enable realtime subscriptions for the session_skipper_tracking table
  so that the live tracking dashboard receives instant updates when
  race results are saved.
*/

-- Enable realtime for session_skipper_tracking
ALTER PUBLICATION supabase_realtime ADD TABLE session_skipper_tracking;