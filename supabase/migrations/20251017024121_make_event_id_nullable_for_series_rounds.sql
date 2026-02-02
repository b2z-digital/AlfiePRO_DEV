/*
  # Make event_id nullable for series rounds

  1. Changes
    - Make `event_id` column in `event_attendance` table nullable
    - This allows series rounds to use `series_id` + `round_name` without requiring `event_id`
    - Single events will continue to use `event_id`
  
  2. Logic
    - For single events: `event_id` is set (series_id and round_name are null)
    - For series rounds: `series_id` + `round_name` are set (event_id can be null)
  
  3. Note
    - This change is safe because the combination of (series_id, round_name) uniquely identifies a series round
    - The existing RLS policies and application logic already handle both scenarios
*/

-- Make event_id nullable to support series rounds
ALTER TABLE event_attendance 
ALTER COLUMN event_id DROP NOT NULL;