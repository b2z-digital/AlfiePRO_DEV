/*
  # Add button color options to slider slides
  
  1. Changes
    - Add `button_bg_color` column to store button background color
    - Add `button_text_color` column to store button text color
    - Default values for backward compatibility
*/

ALTER TABLE event_slider_slides 
ADD COLUMN IF NOT EXISTS button_bg_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS button_text_color text DEFAULT '#1f2937';