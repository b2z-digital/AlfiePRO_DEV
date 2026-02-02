/*
  # Enable Realtime for Quick Races Table
  
  1. Changes
    - Add quick_races to realtime publication so broadcast view
      receives instant updates when race results are scored
  
  2. Why
    - The ProBroadcastView subscribes to quick_races changes
    - Without this, only polling (every 5 seconds) works
    - This enables instant updates when scoring
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'quick_races'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quick_races;
  END IF;
END $$;
