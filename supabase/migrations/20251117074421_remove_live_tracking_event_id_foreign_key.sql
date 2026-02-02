/*
  # Remove Foreign Key Constraint on live_tracking_events.event_id

  ## Problem
  The `live_tracking_events.event_id` has a foreign key constraint to `quick_races.id`.
  This prevents live tracking from working for:
  - State association events (stored in public_events)
  - National association events (stored in public_events)
  - Race series (which have their own IDs)
  
  The constraint is too restrictive because events can be stored in different tables
  depending on their type (club vs association).

  ## Solution
  Remove the foreign key constraint. We still validate that at least one organization
  ID is present via the check constraint, and the event_id is still required.
  
  The relationship is now more flexible:
  - Club events: event_id references quick_races.id
  - State/National events: event_id references public_events.id
  - Series: event_id references race_series.id

  ## Security
  - RLS policies still enforce that only organization admins can create tracking events
  - The event_id is still NOT NULL, just not constrained to a specific table
*/

-- Drop the foreign key constraint
ALTER TABLE live_tracking_events
  DROP CONSTRAINT IF EXISTS live_tracking_events_event_id_fkey;

-- The event_id column remains NOT NULL but no longer has a foreign key constraint
-- This allows flexibility for different event types across different tables
