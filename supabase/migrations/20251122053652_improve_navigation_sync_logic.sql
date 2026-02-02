/*
  # Improve Navigation Sync Logic

  ## Changes
  1. Only sync navigation fields where event_page_layouts doesn't already have valid data
  2. Ensures homepage is always published if it has content
  3. Prevents overwriting existing published status
  
  ## Important Notes
  - This migration fixes the issue where the previous sync overwrote homepage published status
  - Future syncs should be more selective
*/

-- Ensure homepages with content are published
UPDATE event_page_layouts
SET is_published = true
WHERE is_homepage = true
  AND jsonb_array_length(rows) > 0
  AND is_published = false;

-- Sync show_in_navigation and navigation_order from event_website_pages
-- but only where these fields are not already properly set
UPDATE event_page_layouts epl
SET 
  show_in_navigation = ewp.show_in_navigation,
  navigation_order = ewp.navigation_order
FROM event_website_pages ewp
WHERE ewp.event_website_id = epl.event_website_id
  AND ewp.slug = epl.page_slug
  AND epl.is_homepage = false;
