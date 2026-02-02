/*
  # Add Google Analytics Tracking Support

  1. Changes to `clubs` table
    - Add `google_analytics_id` column to store GA4 tracking ID (e.g., G-XXXXXXXXXX)

  2. Changes to `event_websites` table
    - Add `google_analytics_id` column to store GA4 tracking ID for event websites

  3. Purpose
    - Allow clubs and event websites to track visitor analytics
    - Support for Google Analytics 4 (GA4) measurement IDs
*/

-- Add Google Analytics ID to clubs table
ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS google_analytics_id text;

-- Add Google Analytics ID to event_websites table
ALTER TABLE event_websites
ADD COLUMN IF NOT EXISTS google_analytics_id text;
