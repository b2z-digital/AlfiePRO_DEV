/*
  # Add website_published column to event_websites

  1. Changes
    - Add `website_published` boolean column to event_websites table
    - Set default to false
    - Backfill existing records based on enabled status
  
  2. Notes
    - This column is used by the Domain Management system
    - Matches the clubs table structure for consistency
*/

-- Add website_published column
ALTER TABLE event_websites 
ADD COLUMN IF NOT EXISTS website_published boolean DEFAULT false;

-- Backfill existing records: set to true if enabled and status is published
UPDATE event_websites 
SET website_published = (enabled = true AND status = 'published')
WHERE website_published IS NULL OR website_published = false;
