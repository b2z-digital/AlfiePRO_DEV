/*
  # Sync Quick Races to Public Events v2

  1. Purpose
    - Automatically sync quick_races to public_events for public visibility
    - Club-level events are auto-approved
    - Keeps public_events in sync when quick_races are created/updated

  2. Changes
    - Create function to sync quick_race to public_event (including race_format)
    - Create trigger to auto-sync on insert/update
    - Backfill existing quick_races to public_events

  3. Security
    - Club events are automatically approved
    - Public can view approved events via existing RLS policies
*/

-- Function to sync quick_race to public_event
CREATE OR REPLACE FUNCTION sync_quick_race_to_public_event()
RETURNS TRIGGER AS $$
DECLARE
  v_public_event_id UUID;
BEGIN
  -- Only sync if club_id is present
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if public event already exists
  IF NEW.public_event_id IS NOT NULL THEN
    -- Update existing public event
    UPDATE public.public_events
    SET
      event_name = COALESCE(NEW.event_name, 'Untitled Event'),
      date = COALESCE(NEW.race_date, NEW.created_at::date::text),
      venue = COALESCE(NEW.race_venue, ''),
      race_class = COALESCE(NEW.race_class, ''),
      race_format = COALESCE(NEW.race_format, 'fleet'),
      event_level = 'club',
      approval_status = 'approved',
      updated_at = NOW()
    WHERE id = NEW.public_event_id;
    
    RETURN NEW;
  ELSE
    -- Create new public event
    INSERT INTO public.public_events (
      club_id,
      event_name,
      date,
      venue,
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
    
    -- Update quick_race with public_event_id
    NEW.public_event_id := v_public_event_id;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-sync on insert/update
DROP TRIGGER IF EXISTS sync_quick_race_to_public_event_trigger ON public.quick_races;
CREATE TRIGGER sync_quick_race_to_public_event_trigger
  BEFORE INSERT OR UPDATE ON public.quick_races
  FOR EACH ROW
  EXECUTE FUNCTION sync_quick_race_to_public_event();

-- Backfill existing quick_races to public_events
DO $$
DECLARE
  race RECORD;
  v_public_event_id UUID;
BEGIN
  FOR race IN 
    SELECT * FROM public.quick_races 
    WHERE club_id IS NOT NULL 
    AND public_event_id IS NULL
  LOOP
    -- Insert into public_events
    INSERT INTO public.public_events (
      club_id,
      event_name,
      date,
      venue,
      race_class,
      race_format,
      event_level,
      created_by_type,
      created_by_id,
      approval_status,
      created_at,
      updated_at
    ) VALUES (
      race.club_id,
      COALESCE(race.event_name, 'Untitled Event'),
      COALESCE(race.race_date, race.created_at::date::text),
      COALESCE(race.race_venue, ''),
      COALESCE(race.race_class, ''),
      COALESCE(race.race_format, 'fleet'),
      'club',
      'club',
      race.club_id,
      'approved',
      race.created_at,
      NOW()
    )
    RETURNING id INTO v_public_event_id;
    
    -- Update quick_race with public_event_id
    UPDATE public.quick_races
    SET public_event_id = v_public_event_id
    WHERE id = race.id;
  END LOOP;
END $$;
