/*
  # Remove Event Website ID Foreign Key Constraint
  
  The event_website_events junction table has an FK constraint on event_website_id
  that's causing issues during inserts (possibly due to trigger timing).
  
  Changes:
  1. Drop the foreign key constraint on event_website_events.event_website_id
*/

-- Drop the foreign key constraint
ALTER TABLE event_website_events 
DROP CONSTRAINT IF EXISTS event_website_events_event_website_id_fkey;