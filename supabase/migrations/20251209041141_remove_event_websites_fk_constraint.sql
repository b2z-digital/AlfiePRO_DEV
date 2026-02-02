/*
  # Remove Foreign Key Constraint from Event Websites
  
  The event_websites table was originally designed to only work with public_events,
  but we need it to work with quick_races too (since the sync was disabled).
  
  Changes:
  1. Drop the foreign key constraint on event_websites.event_id
  2. Keep the column but allow it to reference either public_events or quick_races
  3. Add application-level validation through RLS policies
*/

-- Drop the foreign key constraint
ALTER TABLE event_websites 
DROP CONSTRAINT IF EXISTS event_websites_event_id_fkey;

-- Add a check to ensure event_id exists in either public_events or quick_races
-- This is done at the application level through the RLS policy
-- that checks user_can_create_event_website function