/*
  # Remove Foreign Key Constraint on live_tracking_sessions.event_id
  
  ## Problem
  The `live_tracking_sessions.event_id` has a foreign key constraint to `quick_races.id`.
  This prevents users from creating tracking sessions for:
  - State association events (stored in public_events)
  - National association events (stored in public_events)
  - Race series
  
  When a user tries to select their skipper profile for a public_events event,
  the INSERT fails with a foreign key constraint violation, showing a browser
  error "Failed to start tracking. Please try again."
  
  ## Solution
  Remove the foreign key constraint from live_tracking_sessions.event_id.
  The event_id is still required (NOT NULL), but now it can reference events from
  any table (quick_races, public_events, race_series).
  
  ## Security
  - RLS policies still control who can create and view sessions
  - The event must have a valid live_tracking_events entry to be accessible
  - Guest users can create sessions without authentication (as designed)
*/

-- Drop the foreign key constraint from live_tracking_sessions
ALTER TABLE live_tracking_sessions
  DROP CONSTRAINT IF EXISTS live_tracking_sessions_event_id_fkey;

-- The event_id column remains NOT NULL but no longer has a foreign key constraint
-- This allows tracking sessions for events stored in different tables