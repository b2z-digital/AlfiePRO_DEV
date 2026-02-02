/*
  # Remove foreign key constraint from livestream_sessions.event_id

  1. Changes
    - Drop the foreign key constraint on `livestream_sessions.event_id`
    - This allows livestream sessions to work with any event type:
      - Quick races (from `quick_races` table)
      - Series rounds (from `race_series_rounds` table)
      - Public events

  2. Reasoning
    - Series rounds have UUIDs that don't exist in `quick_races`
    - The constraint was blocking creation of livestream sessions for series events
    - We still track the event_id, but without enforcing referential integrity
    - This matches the pattern used for `live_tracking_sessions`
*/

-- Drop the foreign key constraint on event_id
ALTER TABLE public.livestream_sessions
  DROP CONSTRAINT IF EXISTS livestream_sessions_event_id_fkey;
