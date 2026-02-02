/*
  # Fix Livestream Sessions for Series Rounds
  
  1. Changes
    - Drop foreign key constraint on quick_race_id
    - Change quick_race_id column from uuid to text
    - This allows storing composite IDs for series rounds (e.g., "series-uuid-0", "series-uuid-1")
    - Each round in a series can have its own independent livestream
  
  2. Purpose
    - Enable separate YouTube livestreams for each round in a series
    - Rounds happen on different days/times and need independent streams
    - The quick_race_id field now stores any event ID format (single events or series rounds)
*/

-- Drop the foreign key constraint
ALTER TABLE livestream_sessions 
  DROP CONSTRAINT IF EXISTS livestream_sessions_quick_race_id_fkey;

-- Change quick_race_id from uuid to text to support composite IDs
ALTER TABLE livestream_sessions 
  ALTER COLUMN quick_race_id TYPE text USING quick_race_id::text;

-- Add a comment explaining the field
COMMENT ON COLUMN livestream_sessions.quick_race_id IS 'Event ID - can be a single event UUID or composite ID for series rounds (e.g., "uuid-0")';
