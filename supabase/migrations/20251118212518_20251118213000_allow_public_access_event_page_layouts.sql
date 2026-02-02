/*
  # Allow Public Access to Published Event Page Layouts

  ## Summary
  Adds RLS policy to allow anonymous (public) users to view published event page layouts, 
  enabling the public event website to display custom pages.

  ## Changes
  - Add SELECT policy for anonymous users to view published pages from enabled event websites

  ## Security Notes
  - Only published pages (`is_published = true`) from enabled websites are accessible
  - Pages from disabled websites remain hidden
  - This enables the public event website to function properly
*/

-- Allow anonymous users to view published event page layouts for enabled event websites
CREATE POLICY "Public can view published event page layouts"
  ON event_page_layouts
  FOR SELECT
  TO anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM event_websites ew
      WHERE ew.id = event_website_id
      AND ew.enabled = true
    )
  );