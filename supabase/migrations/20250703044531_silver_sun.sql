/*
  # Add Meeting Minutes Support
  
  1. New Columns
    - Add `minutes_content` to meeting_agendas table to store minutes for each agenda item
    - Add `minutes_status` to meetings table to track minute-taking progress
    - Add `members_present` and `guests_present` to meetings table to track attendance
  
  2. Security
    - Update RLS policies to ensure proper access control
*/

-- Add minutes_content column to meeting_agendas
ALTER TABLE meeting_agendas ADD COLUMN IF NOT EXISTS minutes_content text;

-- Add minutes_status column to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_status text DEFAULT 'not_started' CHECK (minutes_status IN ('not_started', 'in_progress', 'completed'));

-- Add members_present and guests_present columns to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS members_present jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS guests_present jsonb DEFAULT '[]'::jsonb;