/*
  # Add Live Tracking Toggle to Events

  1. Changes
    - Add `enable_live_tracking` column to `quick_races` table
    - Add `enable_live_tracking` column to `race_series` table
    - Default value is `false` to maintain backward compatibility
    - Allows event organizers to opt-in to live tracking features

  2. Notes
    - Live tracking includes fleet board and skipper position tracking
    - When disabled, live tracking UI elements will be hidden
    - Helps reduce database usage for events that don't need tracking
*/

-- Add enable_live_tracking to quick_races
ALTER TABLE quick_races
ADD COLUMN IF NOT EXISTS enable_live_tracking boolean DEFAULT false;

-- Add enable_live_tracking to race_series
ALTER TABLE race_series
ADD COLUMN IF NOT EXISTS enable_live_tracking boolean DEFAULT false;

-- Add helpful comment
COMMENT ON COLUMN quick_races.enable_live_tracking IS 'Enable live fleet board and skipper tracking for this event';
COMMENT ON COLUMN race_series.enable_live_tracking IS 'Enable live fleet board and skipper tracking for this series';
