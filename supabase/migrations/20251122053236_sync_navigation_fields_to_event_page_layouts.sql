/*
  # Sync Navigation Fields to Event Page Layouts

  ## Changes
  1. Updates `event_page_layouts` table to sync `show_in_navigation`, `is_published`, and `navigation_order` from `event_website_pages`
  2. This ensures that the navigation system works correctly when loading from `event_page_layouts`
  
  ## Important Notes
  - This is a one-time data sync to fix existing pages
  - New pages created going forward will have these fields properly set by the application code
*/

-- Update event_page_layouts with values from event_website_pages
UPDATE event_page_layouts epl
SET 
  show_in_navigation = ewp.show_in_navigation,
  is_published = ewp.is_published,
  navigation_order = ewp.navigation_order
FROM event_website_pages ewp
WHERE ewp.event_website_id = epl.event_website_id
  AND ewp.slug = epl.page_slug;
