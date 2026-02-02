/*
  # Add completed_steps tracking to club setup applications

  1. Changes
    - Add `completed_steps` jsonb column to track which steps have been completed
    - This allows proper restoration of wizard progress when users return

  2. Notes
    - Stores array of step indices that have been completed
    - Helps maintain visual progress indicators in the wizard
*/

-- Add completed_steps column
ALTER TABLE club_setup_applications
ADD COLUMN IF NOT EXISTS completed_steps jsonb DEFAULT '[]'::jsonb;
