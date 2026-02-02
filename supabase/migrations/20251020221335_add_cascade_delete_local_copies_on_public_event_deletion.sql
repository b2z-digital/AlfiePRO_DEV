/*
  # Cascade delete local copies when public event is deleted

  1. New Functions
    - `cascade_delete_public_event_copies()` trigger function
      - Automatically deletes all local copies from quick_races when public event is deleted
      - Ensures event is fully removed from all club calendars and management dashboards
    
  2. Trigger
    - Runs BEFORE DELETE on public_events table
    - Deletes all quick_races entries that reference the public event via public_event_id
    
  3. Security
    - Runs with SECURITY DEFINER to bypass RLS
    - Only deletes local copies belonging to the deleted public event
    
  4. Important Notes
    - This removes all scoring data from clubs when event is deleted
    - Clubs will lose their results, scores, and skipper data for this event
    - This is intentional - event owner has authority to fully remove the event
*/

-- Create function to cascade delete local copies
CREATE OR REPLACE FUNCTION cascade_delete_public_event_copies()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete all local copies in quick_races that reference this public event
  DELETE FROM quick_races
  WHERE public_event_id = OLD.id;
  
  -- Return OLD to allow the public_events deletion to proceed
  RETURN OLD;
END;
$$;

-- Create trigger to run before public event deletion
DROP TRIGGER IF EXISTS cascade_delete_public_event_copies_trigger ON public_events;

CREATE TRIGGER cascade_delete_public_event_copies_trigger
  BEFORE DELETE ON public_events
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_public_event_copies();

-- Add helpful comment
COMMENT ON FUNCTION cascade_delete_public_event_copies() IS 
  'Automatically deletes all local club copies (quick_races) when a public event is deleted. This ensures the event is fully removed from all calendars and management dashboards.';
