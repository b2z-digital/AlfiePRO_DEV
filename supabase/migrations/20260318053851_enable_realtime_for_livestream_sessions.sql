/*
  # Enable Realtime for Livestream Sessions

  1. Changes
    - Add `livestream_sessions` to the Supabase realtime publication
    - Set REPLICA IDENTITY to FULL for proper change detection

  2. Impact
    - AlfieTV viewers will instantly see pause/resume/end status changes
    - Enables real-time subscriptions on `livestream_sessions` table
    - Required for the "Event on Hold" overlay and auto-resume on viewer side
*/

ALTER TABLE livestream_sessions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE livestream_sessions;
