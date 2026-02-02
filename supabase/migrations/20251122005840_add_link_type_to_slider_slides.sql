/*
  # Add link type to slider slides
  
  1. Changes
    - Add `link_type` column to `event_slider_slides` table
      - Options: 'registration' or 'custom'
      - Defaults to 'custom' for backward compatibility
*/

ALTER TABLE event_slider_slides 
ADD COLUMN IF NOT EXISTS link_type text DEFAULT 'custom';