/*
  # Fix heat_observers event_id foreign key for series rounds

  1. Changes
    - Drop the foreign key constraint on `heat_observers.event_id` that only references `quick_races`
    - This allows observer records to be created for both quick races AND race series rounds
    - The event_id can now reference either a quick_race ID or a race_series_round ID
    - RLS policies already handle access control for both table types

  2. Impact
    - Observers can now be saved and toggled for series events (HMS, SHRS modes)
    - Previously, all observer writes for series events silently failed due to this FK violation
*/

ALTER TABLE heat_observers DROP CONSTRAINT IF EXISTS heat_observers_event_id_fkey;