/*
  # Add Multi-Event Button Support
  
  1. Purpose
     - Enable multiple registration buttons when event websites have grouped events
     - Support separate buttons for each event's registration form
  
  2. Changes
     - Add `buttons` JSONB array column to event_slider_slides for multiple buttons
     - Add `buttons` JSONB array to event_global_sections config for CTA buttons
     - Create helper view to get grouped events for button configuration
  
  3. Schema
     - buttons array will contain: [{id, text, url, event_id, bg_color, text_color, link_type}]
*/

-- Add buttons column to event_slider_slides (while keeping legacy columns for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'event_slider_slides' AND column_name = 'buttons'
  ) THEN
    ALTER TABLE event_slider_slides 
    ADD COLUMN buttons JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create a view to easily get all events for a website (primary + grouped)
CREATE OR REPLACE VIEW event_website_all_events AS
SELECT 
  ew.id as event_website_id,
  ew.event_id as primary_event_id,
  pe.event_name as primary_event_name,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ewe.event_id,
          'event_name', pe2.event_name,
          'is_primary', ewe.is_primary,
          'display_order', ewe.display_order
        ) ORDER BY ewe.display_order
      )
      FROM event_website_events ewe
      JOIN public_events pe2 ON pe2.id = ewe.event_id
      WHERE ewe.event_website_id = ew.id
    ),
    jsonb_build_array(
      jsonb_build_object(
        'id', ew.event_id,
        'event_name', pe.event_name,
        'is_primary', true,
        'display_order', 0
      )
    )
  ) as all_events,
  (
    SELECT COUNT(*)
    FROM event_website_events ewe
    WHERE ewe.event_website_id = ew.id
  ) as grouped_event_count
FROM event_websites ew
LEFT JOIN public_events pe ON pe.id = ew.event_id;

-- Migrate existing single buttons to buttons array for slider slides
UPDATE event_slider_slides
SET buttons = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'text', button_text,
    'url', button_url,
    'link_type', COALESCE(link_type, 'custom'),
    'bg_color', COALESCE(button_bg_color, '#ffffff'),
    'text_color', COALESCE(button_text_color, '#1f2937'),
    'event_id', NULL
  )
)
WHERE buttons = '[]'::jsonb
AND button_text IS NOT NULL
AND button_text != '';

COMMENT ON COLUMN event_slider_slides.buttons IS 'Array of button configurations for multi-event support. Each button can link to a specific event registration.';
COMMENT ON VIEW event_website_all_events IS 'View that combines primary event with grouped events for easy button configuration';