/*
  # Sync Page Order Between Tables

  ## Changes
  1. Creates trigger to sync navigation_order, show_in_navigation, and is_published from event_website_pages to event_page_layouts
  2. Ensures that when pages are reordered or their navigation settings change, the event_page_layouts table is automatically updated

  ## Important Notes
  - This keeps the two tables in sync automatically
  - The trigger fires on INSERT and UPDATE of event_website_pages
*/

-- Create function to sync page navigation settings
CREATE OR REPLACE FUNCTION public.sync_page_navigation_to_layouts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update event_page_layouts with the new navigation settings
  UPDATE event_page_layouts
  SET
    navigation_order = NEW.navigation_order,
    show_in_navigation = NEW.show_in_navigation,
    is_published = NEW.is_published
  WHERE event_website_id = NEW.event_website_id
    AND page_slug = NEW.slug;

  RETURN NEW;
END;
$$;

-- Create trigger on event_website_pages
DROP TRIGGER IF EXISTS sync_page_navigation_trigger ON event_website_pages;

CREATE TRIGGER sync_page_navigation_trigger
  AFTER INSERT OR UPDATE OF navigation_order, show_in_navigation, is_published
  ON event_website_pages
  FOR EACH ROW
  EXECUTE FUNCTION sync_page_navigation_to_layouts();