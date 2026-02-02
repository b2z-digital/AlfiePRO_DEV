/*
  # Add public event reference tracking

  1. Changes
    - Add `public_event_id` column to `quick_races` table
    - This tracks which public event (if any) this local copy is based on
    - Allows proper filtering of duplicate events in UI
    - Enables deletion of local copies

  2. Purpose
    - When a club scores a state/national event, we create a local copy in quick_races
    - This column stores the original public_events.id for reference
    - Helps identify and manage local copies vs original club events
*/

-- Add public_event_id column to track local copies of public events
ALTER TABLE quick_races 
ADD COLUMN IF NOT EXISTS public_event_id uuid REFERENCES public_events(id) ON DELETE SET NULL;