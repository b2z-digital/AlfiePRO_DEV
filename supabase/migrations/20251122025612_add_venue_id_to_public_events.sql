/*
  # Add venue_id to public_events

  1. Changes
    - Add venue_id column to public_events table
    - Add foreign key reference to venues table
    - Update existing records to link venue_id based on venue name and club_id
    - Update sync triggers to include venue_id

  2. Purpose
    - Enable weather widgets to fetch venue coordinates
    - Allow proper venue relationships for event websites
*/

-- Add venue_id column to public_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_public_events_venue_id ON public.public_events(venue_id);
  END IF;
END $$;

-- Backfill venue_id for existing records
-- Match by venue name and club_id
UPDATE public.public_events pe
SET venue_id = v.id
FROM public.venues v
WHERE pe.venue_id IS NULL
  AND pe.venue IS NOT NULL
  AND pe.venue != ''
  AND v.club_id = pe.club_id
  AND LOWER(TRIM(v.name)) = LOWER(TRIM(pe.venue));

-- Update the sync trigger to include venue_id
CREATE OR REPLACE FUNCTION sync_quick_race_to_public_event()
RETURNS TRIGGER AS $$
DECLARE
  v_public_event_id UUID;
BEGIN
  IF NEW.public_event_id IS NULL THEN
    INSERT INTO public.public_events (
      club_id,
      event_name,
      date,
      venue,
      venue_id,
      race_class,
      race_format,
      event_level,
      created_by_type,
      created_by_id,
      approval_status,
      created_at,
      updated_at
    ) VALUES (
      NEW.club_id,
      COALESCE(NEW.event_name, 'Untitled Event'),
      COALESCE(NEW.race_date, NEW.created_at::date::text),
      COALESCE(NEW.race_venue, ''),
      NEW.venue_id,
      COALESCE(NEW.race_class, ''),
      COALESCE(NEW.race_format, 'fleet'),
      'club',
      'club',
      NEW.club_id,
      'approved',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_public_event_id;
    
    NEW.public_event_id := v_public_event_id;
    
    RETURN NEW;
  ELSE
    UPDATE public.public_events
    SET
      event_name = COALESCE(NEW.event_name, event_name),
      date = COALESCE(NEW.race_date, date),
      venue = COALESCE(NEW.race_venue, venue),
      venue_id = COALESCE(NEW.venue_id, venue_id),
      race_class = COALESCE(NEW.race_class, race_class),
      race_format = COALESCE(NEW.race_format, race_format),
      updated_at = NOW()
    WHERE id = NEW.public_event_id;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
