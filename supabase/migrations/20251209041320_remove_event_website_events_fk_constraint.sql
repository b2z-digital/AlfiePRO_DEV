/*
  # Remove Foreign Key Constraint from Event Website Events Junction Table
  
  The event_website_events junction table also has a FK constraint that only 
  allows public_events. We need to support quick_races too.
  
  Changes:
  1. Drop the foreign key constraint on event_website_events.event_id
  2. Allow it to reference either public_events or quick_races
*/

-- Drop the foreign key constraint
ALTER TABLE event_website_events 
DROP CONSTRAINT IF EXISTS event_website_events_event_id_fkey;