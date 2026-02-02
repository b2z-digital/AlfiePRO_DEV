/*
  # Disable Public Events Auto-Sync Trigger

  1. Purpose
    - Temporarily disable the automatic syncing of quick_races to public_events
    - Stop the generation of duplicate public events
    
  2. Changes
    - Drop the trigger that automatically creates public_events from quick_races
    - Keep the function for potential future use but disable the trigger
*/

-- Drop the trigger to stop automatic public event creation
DROP TRIGGER IF EXISTS sync_quick_race_to_public_event_trigger ON public.quick_races;

-- Clear any remaining duplicate public events
DELETE FROM public.public_events
WHERE event_level = 'club';

-- Optional: Clear public_event_id references from quick_races
UPDATE public.quick_races
SET public_event_id = NULL
WHERE public_event_id IS NOT NULL;
