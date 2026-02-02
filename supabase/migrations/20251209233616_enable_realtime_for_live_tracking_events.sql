/*
  # Enable Realtime for Live Tracking Events

  1. Changes
    - Enable realtime updates for live_tracking_events table
    - This allows race status changes to broadcast to all connected clients

  2. Purpose
    - Allows skippers viewing the race tracker to see status updates in real-time
    - No page refresh required when race status changes
*/

-- Enable realtime for live_tracking_events table
ALTER PUBLICATION supabase_realtime ADD TABLE live_tracking_events;
