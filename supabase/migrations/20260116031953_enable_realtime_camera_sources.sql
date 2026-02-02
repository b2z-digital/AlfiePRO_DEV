/*
  # Enable Realtime for Livestream Camera Sources

  1. Changes
    - Enable replica identity for livestream_camera_sources
    - This allows real-time subscriptions to work properly

  2. Impact
    - Desktop control panel will instantly see mobile cameras connecting
    - Camera status updates will sync in real-time
*/

-- Enable replica identity for real-time subscriptions
ALTER TABLE livestream_camera_sources REPLICA IDENTITY FULL;