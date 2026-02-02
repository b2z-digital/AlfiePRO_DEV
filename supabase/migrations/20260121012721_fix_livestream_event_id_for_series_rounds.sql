/*
  # Fix livestream event_id to support series rounds

  1. Changes
    - Change `event_id` column from uuid to text in livestream_sessions table
    - This allows storing composite IDs for series rounds (e.g., "series-uuid-round-2")
    - Each round in a series can have its own independent livestream session

  2. Purpose
    - Enable separate YouTube livestreams for each round in a series
    - Rounds happen on different days/times and need independent streams
    - Fix issue where all rounds were matching the same livestream session
*/

-- Change event_id from uuid to text to support composite IDs for series rounds
ALTER TABLE public.livestream_sessions
  ALTER COLUMN event_id TYPE text USING event_id::text;

-- Update the comment to reflect the new usage
COMMENT ON COLUMN public.livestream_sessions.event_id IS 'Event ID - can be a single event UUID or composite ID for series rounds (e.g., "uuid-round-2", "uuid-day-3")';