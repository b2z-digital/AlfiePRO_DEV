/*
  # Fix Duplicate Public Events

  1. Problem
    - The sync trigger was creating duplicates because it fired on both INSERT and UPDATE
    - The trigger would create a public_event on INSERT, then fire again when updating the quick_race with public_event_id
    
  2. Solution
    - Delete duplicate public_events (keep the oldest one per quick_race)
    - Fix the trigger to prevent duplicate creation
    - Add safeguards to only sync when necessary
    
  3. Changes
    - Clean up duplicate public_events
    - Update trigger to check if public_event_id already exists before creating
    - Add condition to prevent infinite loop on UPDATE
*/

-- Step 1: Clean up duplicate public_events
-- Keep only the oldest public_event for each unique event (by event_name, date, club_id)
DELETE FROM public.public_events
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY event_name, date, club_id, race_class, race_format
        ORDER BY created_at ASC
      ) as rn
    FROM public.public_events
    WHERE event_level = 'club'
  ) t
  WHERE t.rn > 1
);

-- Step 2: Fix the sync trigger to prevent duplicates
CREATE OR REPLACE FUNCTION sync_quick_race_to_public_event()
RETURNS TRIGGER AS $$
DECLARE
  v_public_event_id UUID;
BEGIN
  -- Only sync if club_id is present
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If public_event_id already exists and this is an UPDATE, just update the public event
  IF NEW.public_event_id IS NOT NULL THEN
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
  END IF;

  -- For INSERT: Only create if public_event_id is NULL
  -- This prevents duplicate creation when the trigger fires on UPDATE
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.public_event_id IS NULL) THEN
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Ensure all quick_races have correct public_event_id references
-- Link quick_races to their corresponding public_events if not already linked
UPDATE public.quick_races qr
SET public_event_id = pe.id
FROM public.public_events pe
WHERE qr.club_id = pe.club_id
  AND qr.event_name = pe.event_name
  AND qr.race_date = pe.date
  AND qr.public_event_id IS NULL
  AND pe.event_level = 'club';
