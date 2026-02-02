/*
  # Add Custom Website Name to Event Websites

  ## Changes
  - Adds `website_name` column to event_websites table
  - Allows custom naming for multi-event websites
  - Falls back to event name if not set

  ## Purpose
  When bundling multiple events into one website, users can set a custom name
  instead of using the primary event's name
*/

-- Add website_name column to event_websites
ALTER TABLE event_websites 
ADD COLUMN IF NOT EXISTS website_name text;

-- Update existing website to have custom name
UPDATE event_websites 
SET website_name = '2026 DF Australian Championship'
WHERE slug = '2026dfnationals';