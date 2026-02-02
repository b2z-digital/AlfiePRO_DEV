/*
  # Auto-populate Event Website Events

  1. Purpose
    - Automatically populate event_website_events junction table when event websites are created
    - Ensures the primary event is always included in the grouped events
    - Enables automatic multi-event website configuration

  2. Changes
    - Add trigger function to auto-populate event_website_events when event_website is created
    - Add trigger function to keep event_website_events in sync when event_website.event_id changes
    - Ensures seamless multi-event grouping without manual database intervention

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS for system operations
    - Only modifies data for the current event website
*/

-- Function to auto-populate event_website_events when event_website is created
CREATE OR REPLACE FUNCTION public.auto_populate_event_website_events()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only insert if the event_id is not null and no entries exist yet
  IF NEW.event_id IS NOT NULL THEN
    -- Check if any entries already exist for this website
    IF NOT EXISTS (
      SELECT 1 FROM event_website_events 
      WHERE event_website_id = NEW.id
    ) THEN
      -- Insert the primary event as the first and only event
      INSERT INTO event_website_events (
        event_website_id,
        event_id,
        is_primary,
        display_order
      ) VALUES (
        NEW.id,
        NEW.event_id,
        true,
        0
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to auto-populate event_website_events after event_website insert
DROP TRIGGER IF EXISTS trigger_auto_populate_event_website_events ON event_websites;

CREATE TRIGGER trigger_auto_populate_event_website_events
  AFTER INSERT ON event_websites
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_event_website_events();

-- Function to sync event_website_events when event_website.event_id changes
CREATE OR REPLACE FUNCTION public.sync_event_website_primary_event()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If the event_id changed and there's only one event in the group
  IF OLD.event_id IS DISTINCT FROM NEW.event_id 
     AND NEW.event_id IS NOT NULL THEN
    
    -- Check if this is a single-event website (only 1 entry in event_website_events)
    IF (SELECT COUNT(*) FROM event_website_events WHERE event_website_id = NEW.id) <= 1 THEN
      -- Update or insert the primary event
      INSERT INTO event_website_events (
        event_website_id,
        event_id,
        is_primary,
        display_order
      ) VALUES (
        NEW.id,
        NEW.event_id,
        true,
        0
      )
      ON CONFLICT (event_website_id, event_id) 
      DO UPDATE SET is_primary = true;
      
      -- Remove the old event if it exists and was the only one
      DELETE FROM event_website_events
      WHERE event_website_id = NEW.id
        AND event_id = OLD.event_id
        AND event_id != NEW.event_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to sync event_website_events after event_website update
DROP TRIGGER IF EXISTS trigger_sync_event_website_primary_event ON event_websites;

CREATE TRIGGER trigger_sync_event_website_primary_event
  AFTER UPDATE ON event_websites
  FOR EACH ROW
  WHEN (OLD.event_id IS DISTINCT FROM NEW.event_id)
  EXECUTE FUNCTION sync_event_website_primary_event();

-- Backfill existing event_websites that don't have entries in event_website_events
INSERT INTO event_website_events (event_website_id, event_id, is_primary, display_order)
SELECT 
  ew.id,
  ew.event_id,
  true,
  0
FROM event_websites ew
WHERE ew.event_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM event_website_events ewe 
    WHERE ewe.event_website_id = ew.id
  )
ON CONFLICT (event_website_id, event_id) DO NOTHING;
