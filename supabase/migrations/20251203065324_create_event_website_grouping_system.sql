/*
  # Event Website Multi-Event Grouping System

  ## Purpose
  Allows one event website to promote multiple related events (e.g., DF65 and DF95 championships at same location/dates)

  ## Changes
  1. **New Tables**
    - `event_website_events` - Junction table linking multiple events to one website
      - `id` (uuid, primary key)
      - `event_website_id` (uuid, references event_websites)
      - `event_id` (uuid, references public_events)
      - `is_primary` (boolean) - marks the main event
      - `display_order` (integer) - order to show events on website
      - `created_at` (timestamptz)
  
  2. **Changes to Existing Tables**
    - Make `event_websites.event_id` nullable (will use junction table instead)
    - Add migration to copy existing event_id relationships to junction table
  
  3. **Security**
    - Enable RLS on junction table
    - Admins of any linked event can manage the website
    - Public can view published event websites
  
  ## Benefits
  - Single website URL for multi-class championships
  - Unified registration, results, media for all related events
  - Better SEO and promotion
  - Cleaner UX for visitors
*/

-- Create junction table for event website grouping
CREATE TABLE IF NOT EXISTS event_website_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_website_id uuid NOT NULL REFERENCES event_websites(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public_events(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_website_id, event_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_event_website_events_website_id ON event_website_events(event_website_id);
CREATE INDEX IF NOT EXISTS idx_event_website_events_event_id ON event_website_events(event_id);
CREATE INDEX IF NOT EXISTS idx_event_website_events_primary ON event_website_events(event_website_id, is_primary) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE event_website_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can view event website groupings for published sites"
  ON event_website_events FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_events.event_website_id
      AND ew.status = 'published'
      AND ew.enabled = true
    )
  );

CREATE POLICY "Admins of any linked event can manage groupings"
  ON event_website_events FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_events pe
      WHERE pe.id = event_website_events.event_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM event_website_events ewe
      JOIN public_events pe ON ewe.event_id = pe.id
      WHERE ewe.event_website_id = event_website_events.event_website_id
      AND (
        public.is_national_admin(auth.uid())
        OR public.is_state_admin(auth.uid())
        OR public.is_org_admin(pe.club_id)
      )
    )
  );

-- Migrate existing event_websites.event_id to junction table
-- Only migrate if event_id is not null
INSERT INTO event_website_events (event_website_id, event_id, is_primary, display_order)
SELECT id, event_id, true, 0
FROM event_websites
WHERE event_id IS NOT NULL
ON CONFLICT (event_website_id, event_id) DO NOTHING;

-- Make event_id nullable (keep column for backward compatibility but not required)
-- DO NOT drop the column as some queries may still reference it
-- Instead, we'll update it to match the primary event from junction table

-- Create function to get primary event for a website
CREATE OR REPLACE FUNCTION get_event_website_primary_event(website_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT event_id 
    FROM event_website_events 
    WHERE event_website_id = website_id 
    AND is_primary = true 
    LIMIT 1
  );
END;
$$;

-- Create function to ensure only one primary event per website
CREATE OR REPLACE FUNCTION ensure_single_primary_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If setting is_primary to true, unset all other primaries for this website
  IF NEW.is_primary = true THEN
    UPDATE event_website_events
    SET is_primary = false
    WHERE event_website_id = NEW.event_website_id
    AND id != NEW.id;
  END IF;
  
  -- Ensure at least one event is marked as primary
  IF NOT EXISTS (
    SELECT 1 FROM event_website_events
    WHERE event_website_id = NEW.event_website_id
    AND is_primary = true
  ) THEN
    -- If this is the only event, make it primary
    IF (SELECT COUNT(*) FROM event_website_events WHERE event_website_id = NEW.event_website_id) = 1 THEN
      NEW.is_primary = true;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_ensure_single_primary_event
  BEFORE INSERT OR UPDATE ON event_website_events
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_primary_event();

-- Update event_websites.event_id to sync with primary event
-- This keeps backward compatibility
CREATE OR REPLACE FUNCTION sync_event_website_primary_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When primary event changes, update the event_websites table
  IF NEW.is_primary = true THEN
    UPDATE event_websites
    SET event_id = NEW.event_id
    WHERE id = NEW.event_website_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sync_event_website_primary_event
  AFTER INSERT OR UPDATE ON event_website_events
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION sync_event_website_primary_event();